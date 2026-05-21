from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pickle
import json
import numpy as np
import pandas as pd
import shap
from sklearn.tree import DecisionTreeClassifier

app = FastAPI(title="SWAT Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Cargar archivos al arrancar
with open("gb_produccion.pkl", "rb") as f:
    gb = pickle.load(f)

with open("dt_auxiliar.pkl", "rb") as f:
    dt_aux = pickle.load(f)

with open("feature_stats.json") as f:
    feature_stats = json.load(f)

with open("background_sample.json") as f:
    X_background = np.array(json.load(f))

with open("casos_modo1.json", encoding="utf-8") as f:
    datos_modo1 = json.load(f)

FEATURE_COLS = datos_modo1["feature_cols"]
CASOS        = datos_modo1["casos"]
UMBRAL       = 0.2

explainer_shap = shap.TreeExplainer(gb, X_background)

print(f"Modelo cargado — {len(FEATURE_COLS)} features — {len(CASOS)} casos")

# ── Health check
@app.get("/")
def health():
    return {
        "status":   "ok",
        "modelo":   "GradientBoosting SWAT",
        "features": len(FEATURE_COLS),
        "casos":    len(CASOS)
    }

# ── Lista de casos disponibles
@app.get("/casos")
def get_casos():
    return [
        {
            "id":          caso_id,
            "tipo":        caso["tipo"],
            "descripcion": caso["descripcion"],
            "timestamp":   caso["timestamp"],
            "label_real":  caso["label_real"]
        }
        for caso_id, caso in CASOS.items()
    ]

# ── Predicción + SHAP + regla DT para un caso concreto
@app.get("/predict/{caso_id}")
def predict_caso(caso_id: str):

    if caso_id not in CASOS:
        raise HTTPException(status_code=404,
                            detail=f"Caso '{caso_id}' no encontrado")

    caso     = CASOS[caso_id]
    features = caso["features"]

    # Vector de features en el orden correcto
    registro = np.array([
        features.get(f, 0.0) for f in FEATURE_COLS
    ]).reshape(1, -1)

    # ── Predicción
    prob_ataque = float(gb.predict_proba(registro)[0][1])
    prediccion  = "Ataque" if prob_ataque >= UMBRAL else "Normal"

    # ── Validar rangos
    warnings = []
    for i, feat in enumerate(FEATURE_COLS):
        val  = registro[0][i]
        mean = feature_stats[feat]["mean"]
        std  = feature_stats[feat]["std"]
        if std > 0 and abs(val - mean) > 3 * std:
            warnings.append(f"{feat} fuera del rango habitual")

    # ── SHAP
    shap_vals = explainer_shap.shap_values(registro)[0]
    shap_base = float(explainer_shap.expected_value)

    shap_result = sorted([
        {
            "feature":    feat,
            "valor":      round(float(registro[0][i]), 4),
            "shap_value": round(float(shap_vals[i]), 4)
        }
        for i, feat in enumerate(FEATURE_COLS)
    ], key=lambda x: abs(x["shap_value"]), reverse=True)

    # ── Regla Decision Tree
    feature_idx = dt_aux.tree_.feature
    threshold   = dt_aux.tree_.threshold
    node        = 0
    regla       = []

    while dt_aux.tree_.children_left[node] != -1:
        feat_i      = feature_idx[node]
        thres       = threshold[node]
        val         = registro[0][feat_i]
        nombre_feat = FEATURE_COLS[feat_i]
        shap_f      = float(shap_vals[feat_i])

        if val <= thres:
            condicion = f"{nombre_feat} ≤ {thres:.3f}"
            node = dt_aux.tree_.children_left[node]
        else:
            condicion = f"{nombre_feat} > {thres:.3f}"
            node = dt_aux.tree_.children_right[node]

        regla.append({
            "condicion":  condicion,
            "feature":    nombre_feat,
            "valor":      round(float(val), 4),
            "shap_value": round(shap_f, 4)
        })

    clase_nodo    = int(np.argmax(dt_aux.tree_.value[node]))
    prediccion_dt = "Ataque" if clase_nodo == 1 else "Normal"

    return {
        "caso_id":        caso_id,
        "timestamp":      caso["timestamp"],
        "tipo":           caso["tipo"],
        "descripcion":    caso["descripcion"],
        "label_real":     caso["label_real"],
        "prediccion":     prediccion,
        "probabilidad":   round(prob_ataque, 4),
        "umbral":         UMBRAL,
        "prediccion_dt":  prediccion_dt,
        "shap_base":      shap_base,
        "shap_values":    shap_result[:10],
        "regla":          regla,
        "warnings":       warnings
    }

# ── Feature stats para el frontend
@app.get("/feature_stats")
def get_feature_stats():
    return feature_stats


from fastapi import WebSocket, WebSocketDisconnect
import asyncio

# Cargar secuencias al arrancar
with open("secuencias_escucha.json", encoding="utf-8") as f:
    datos_escucha = json.load(f)

SECUENCIAS = datos_escucha["secuencias"]

# ── Lista de secuencias disponibles
@app.get("/secuencias")
def get_secuencias():
    return [
        {
            "id":          seq_id,
            "nombre":      seq["nombre"],
            "descripcion": seq["descripcion"],
            "n_total":     seq["n_total"],
            "n_normal":    seq["n_normal"],
            "n_ataque":    seq["n_ataque"],
        }
        for seq_id, seq in SECUENCIAS.items()
    ]

# ── WebSocket — modo escucha
@app.websocket("/ws/escucha/{seq_id}")
async def websocket_escucha(websocket: WebSocket, seq_id: str):
    await websocket.accept()

    if seq_id not in SECUENCIAS:
        await websocket.send_json({"error": f"Secuencia '{seq_id}' no encontrada"})
        await websocket.close()
        return

    secuencia  = SECUENCIAS[seq_id]
    registros  = secuencia["registros"]
    ataque_detectado = False

    await websocket.send_json({
        "tipo":    "inicio",
        "seq_id":  seq_id,
        "nombre":  secuencia["nombre"],
        "n_total": secuencia["n_total"]
    })

    for i, registro in enumerate(registros):
        # Comprobar si el cliente sigue conectado
        try:
            # Vector de features
            features  = registro["features"]
            rec_array = np.array([
                features.get(f, 0.0) for f in FEATURE_COLS
            ]).reshape(1, -1)

            # Predicción
            prob_ataque = float(gb.predict_proba(rec_array)[0][1])
            prediccion  = "Ataque" if prob_ataque >= UMBRAL else "Normal"

            # SHAP solo cuando detecta ataque — es más lento
            shap_vals = None
            shap_base = None
            regla = None

            if prediccion == "Ataque" and not ataque_detectado:
                ataque_detectado = True

                sv = explainer_shap.shap_values(rec_array)[0]
                shap_base = float(explainer_shap.expected_value)

                shap_vals = sorted([
                    {
                        "feature": feat,
                        "valor": round(float(rec_array[0][j]), 4),
                        "shap_value": round(float(sv[j]), 4)
                    }
                    for j, feat in enumerate(FEATURE_COLS)
                ], key=lambda x: abs(x["shap_value"]), reverse=True)[:10]

                # Regla DT
                feature_idx = dt_aux.tree_.feature
                threshold   = dt_aux.tree_.threshold
                node        = 0
                regla       = []
                while dt_aux.tree_.children_left[node] != -1:
                    feat_i      = feature_idx[node]
                    thres       = threshold[node]
                    val         = rec_array[0][feat_i]
                    nombre_feat = FEATURE_COLS[feat_i]
                    shap_f      = float(sv[feat_i])
                    if val <= thres:
                        condicion = f"{nombre_feat} ≤ {thres:.3f}"
                        node = dt_aux.tree_.children_left[node]
                    else:
                        condicion = f"{nombre_feat} > {thres:.3f}"
                        node = dt_aux.tree_.children_right[node]
                    regla.append({
                        "condicion":  condicion,
                        "feature":    nombre_feat,
                        "valor":      round(float(val), 4),
                        "shap_value": round(shap_f, 4)
                    })

            await websocket.send_json({
                "tipo": "registro",
                "idx": i,
                "timestamp": registro["timestamp"],
                "label_real": registro["label_real"],
                "prediccion": prediccion,
                "probabilidad": round(prob_ataque, 4),
                "shap_base": shap_base,
                "shap_values": shap_vals,
                "regla": regla,
            })

            # Si detectó ataque enviar evento de alerta y parar
            if ataque_detectado:
                await websocket.send_json({"tipo": "alerta", "idx": i})
                break

            # Delay de 1 segundo entre registros
            await asyncio.sleep(1)

        except WebSocketDisconnect:
            break

    await websocket.send_json({"tipo": "fin"})
    await websocket.close()