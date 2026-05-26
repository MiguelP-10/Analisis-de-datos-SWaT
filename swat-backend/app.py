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

    explicacion_simple = generar_explicacion_simple(
    shap_result, prediccion, prob_ataque
)

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
        "explicacion_simple": explicacion_simple,
        "warnings":       warnings,
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
    explicacion_simple = None 



    await websocket.send_json({
        "tipo":    "inicio",
        "seq_id":  seq_id,
        "nombre":  secuencia["nombre"],
        "n_total": secuencia["n_total"],

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

                                
                explicacion_simple = generar_explicacion_simple(
                    shap_vals, prediccion, prob_ataque
                )

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
                "explicacion_simple": explicacion_simple,

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


# ── Diccionario de traducción de features a lenguaje de técnico de planta
FEATURE_DESCRIPCIONES = {
    "avg_connection_duration_ms":  "duración media de las conexiones de red",
    "max_connection_duration_ms":  "duración máxima de las conexiones de red",
    "packets_per_ms":              "densidad de paquetes por milisegundo",
    "duration_spread":             "variabilidad en la duración de conexiones",
    "is_short_duration":           "indicador de conexiones anormalmente cortas",
    "duration_ratio":              "proporción entre duración media y máxima",
    "LIT401":                      "nivel del tanque 4 (etapa de tratamiento 4)",
    "LIT101":                      "nivel del tanque 1 (etapa de tratamiento 1)",
    "LIT301":                      "nivel del tanque 3 (etapa de tratamiento 3)",
    "FIT201":                      "caudal de entrada en la etapa 2",
    "FIT101":                      "caudal de entrada en la etapa 1",
    "DPIT301":                     "presión diferencial en la etapa 3",
    "lit401_low":                  "nivel del tanque 4 por debajo del mínimo operativo",
    "lit101_high":                 "nivel del tanque 1 por encima del máximo operativo",
    "dpit301_low":                 "presión diferencial en etapa 3 anormalmente baja",
    "fit201_zero":                 "caudal de entrada en etapa 2 cortado o próximo a cero",
    "fit101_zero":                 "caudal de entrada en etapa 1 cortado o próximo a cero",
    "lit101_lit401_ratio":         "relación entre niveles del tanque 1 y tanque 4",
    "transaction_id_std":          "variabilidad en los identificadores de transacción Modbus",
    "transaction_id_range":        "rango de identificadores de transacción Modbus",
    "request_response_ratio":      "proporción entre peticiones y respuestas Modbus",
}

def generar_explicacion_simple(shap_values, prediccion, probabilidad):
    """Genera una explicación en lenguaje natural para un técnico de planta."""

    # Top 3 features que más empujan hacia la predicción
    direccion = 1 if prediccion == "Ataque" else -1
    relevantes = sorted(
        shap_values,
        key=lambda x: x["shap_value"] * direccion,
        reverse=True
    )[:3]

    if prediccion == "Ataque":
        intro = f"El sistema ha clasificado este registro como ATAQUE con una confianza del {probabilidad*100:.1f}%."
        motivo = "Los principales indicadores que han activado la alarma son:"
    else:
        intro = f"El sistema ha clasificado este registro como NORMAL con una confianza del {(1-probabilidad)*100:.1f}%."
        motivo = "Los principales factores que indican operación normal son:"

    factores = []
    for item in relevantes:
        feat = item["feature"]
        val  = item["valor"]
        sv   = item["shap_value"]
        desc = FEATURE_DESCRIPCIONES.get(feat, feat)

        if prediccion == "Ataque" and sv > 0:
            if "duración" in desc and "cortas" in desc:
                factores.append(f"Las conexiones de red son anormalmente cortas ({val:.0f} ms), lo que indica actividad automatizada o manipulación del protocolo.")
            elif "nivel" in desc and "bajo" in desc:
                factores.append(f"El {desc} está en un valor anómalo ({val:.3f}), fuera del rango operativo normal.")
            elif "caudal" in desc and "cortado" in desc:
                factores.append(f"El {desc} ({val:.3f}), lo que indica posible manipulación de válvulas o actuadores.")
            elif "presión" in desc and "baja" in desc:
                factores.append(f"La {desc} está colapsada ({val:.3f}), indicando posible ataque en la etapa 3.")
            elif "nivel" in desc and "alto" in desc:
                factores.append(f"El {desc} está en un valor peligrosamente elevado ({val:.3f}).")
            elif "duración media" in desc:
                factores.append(f"La {desc} es de {val/1e6:.1f} segundos, valor {('bajo' if val < 2e8 else 'alto')} respecto al rango normal (200-400 s).")
            elif "densidad" in desc:
                factores.append(f"La {desc} ({val:.2f}) indica un patrón de tráfico inusual.")
            else:
                factores.append(f"La variable '{desc}' presenta un valor anómalo ({val:.4f}) con alta influencia en la decisión.")
        else:
            factores.append(f"La variable '{desc}' presenta un valor dentro del rango operativo normal ({val:.4f}).")

    partes = [intro, motivo] + [f"• {f}" for f in factores]

    if prediccion == "Ataque":
        partes.append("Se recomienda revisar el estado de los sensores y actuadores indicados y verificar si existe manipulación física o cibernética del sistema.")
    else:
        partes.append("No se han detectado anomalías significativas en este instante temporal.")

    return " ".join(partes)