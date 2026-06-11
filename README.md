# Detección de Intrusiones en Red SCADA — Dataset SWaT

Trabajo de Fin de Grado — Análisis de datos de red y físicos del sistema **SWaT (Secure Water Treatment)** para la detección de ataques ciberfísicos mediante Machine Learning, con una aplicación web de demostración que incluye explicabilidad de las predicciones (SHAP + reglas de decisión).

**Autor:** Miguel Puerta Olivares — Universidad de Castilla-La Mancha (UCLM), Escuela Superior de Ingeniería Informática de Albacete (ESIIAB)

---

## Descripción

Este repositorio contiene el proyecto completo en tres bloques:

1. **Pipeline de datos y modelado** (notebooks `01`–`13`): carga, limpieza, ingeniería de características, entrenamiento y comparación de modelos sobre Databricks + Delta Lake.
2. **Backend** (`swat-backend/`): API FastAPI que sirve el modelo de producción con explicabilidad (SHAP y reglas extraídas de un árbol de decisión auxiliar), tanto por REST como por WebSocket.
3. **Frontend** (`swat-frontend/`): aplicación React que visualiza las predicciones, las contribuciones SHAP y las reglas de decisión, con un modo de escucha en tiempo real.

El sistema SWaT es una planta de tratamiento de agua industrial instrumentada con sensores físicos y red de comunicación SCADA. El objetivo es detectar ataques ciberfísicos a partir del **tráfico de red**, apoyándose en los datos de sensores físicos para corregir y validar las etiquetas de ataque.

---

## Dataset

El dataset SWaT, del laboratorio **iTrust (SUTD, Singapur)**, contiene dos fuentes de datos capturadas durante un experimento de 11 días (7 de operación normal + 4 con ataques):

- **Datos de red** — tráfico SCADA capturado en ~388 ficheros CSV (~388 millones de paquetes)
- **Datos físicos** — lecturas segundo a segundo de sensores y actuadores de la planta (2 ficheros Excel: operación normal y ataques)

> El dataset SWaT es de acceso restringido. Para solicitarlo: [iTrust, SUTD](https://itrust.sutd.edu.sg/itrust-labs_datasets/dataset_info/)

---

## Pipeline de datos

```
Datos de red (CSV)          Datos físicos (Excel)
       │                           │
    NB 01-03                    NB 04-04b
  Carga + features           Carga + limpieza
       │                           │
       └──────────┬────────────────┘
                  │
               NB 05
        Join temporal + corrección de labels
                  │
          ┌───────┴───────┐
      NB 06-07         NB 06B-07B
   EDA + FE (red)    EDA + FE (físicos)
          └───────┬───────┘
                  │
              NB 08-09
       Modelos individuales (red)
                  │
                NB 08B
        Modelo individual (físicos)
                  │
                NB 10
          JOIN red + físicos
                  │
              NB 11-12
     Cross Validation + Comparativa
                  │
                NB 13
       Entrenamiento del modelo
       de producción + artefactos
```

### Notebooks

| Nº | Nombre | Descripción |
|---|---|---|
| 01 | `01_Primeros_pasos` | Carga de los ~388 CSV de red y almacenamiento en Delta Lake |
| 02 | `02_Analisis_Descriptivo_Datos` | EDA inicial, análisis de nulos y gaps temporales |
| 03 | `03_ProcesaminetoTemporalWS` | Extracción de features por ventana temporal de 1 segundo |
| 04 | `04_Medidas_Fisicas` | Carga de los Excel de medidas físicas (normal y ataque) |
| 04b | `04b_Limpieza_Datos_Fisicos` | Limpieza: sensores constantes, variables irrelevantes, periodo de arranque |
| 05 | `05_Union_y_Filstrado_FisicosRed` | Join temporal para corregir etiquetas de red con datos físicos |
| 06 | `06_EDA_Features_Red` | Análisis exploratorio completo de features de red |
| 06B | `06B_EDA_Features_Fisicas` | Análisis exploratorio de sensores físicos — correlación con label |
| 07 | `07_Feature_Engineering_Red` | Eliminación de ruido y creación de nuevas features de red |
| 07B | `07B_Feature_Engineering_Fisicos` | Normalización MinMax, flags binarios y ratios de sensores |
| 08 | `08_Modelo_RF_Simplificado_FN` | Random Forest con 6 features de red + análisis de falsos negativos |
| 08B | `08B_Modelo_RF_Simplificado_Fisicos` | Random Forest sobre features físicas |
| 09 | `09_Modelo_RandomForest_SCADA_v2` | Random Forest con todas las features de red |
| 10 | `10_JOIN_DATOS` | Join por timestamp entre features de red y físicas |
| 11 | `11_Cross_Validation` | Validación cruzada K-Fold estratificada (K=5) sobre dataset combinado |
| 12 | `12_Comparativa_Modelos` | Comparativa de 7 modelos con K-Fold CV |
| 13 | `13_Etreno_Modelo_Produccion` | Entrenamiento del Gradient Boosting de producción y generación de artefactos (modelo, árbol auxiliar, casos y secuencias para la app web) |

> Los notebooks están en formato Databricks. Para importarlos: **Databricks Workspace → Import → seleccionar archivo**

---

## Resultados principales

Evaluación mediante **Stratified K-Fold CV (K=5)** sobre el dataset combinado de 706.319 ventanas temporales:

| Modelo | AUC-ROC | Detección | Falsa alarma | FN |
|---|---|---|---|---|
| LightGBM | 1.0 | 99.96% | 0.29% | 20 |
| XGBoost | 1.0 | 99.93% | 0.27% | 35 |
| CatBoost | 1.0 | 99.93% | 0.32% | 34 |
| Random Forest (6 features, solo red) | 0.9989 | 98.22% | 1.56% | 176 |
| Random Forest (físicos) | 0.9828 | 84.76% | 0.02% | 1.665 |

**Modelo de producción:** `GradientBoostingClassifier` con 21 features y umbral de decisión τ = 0.2 — AUC-ROC = 1.0, tasa de detección del 99.08% y tasa de falsas alarmas del 0.01%.

---

## Aplicación web

La aplicación demuestra el modelo de producción con dos modos de uso:

- **Modo 1 — Casos predefinidos (REST):** el usuario selecciona un caso (normal o de ataque) y obtiene la predicción, la probabilidad, las contribuciones SHAP de cada feature y la regla del árbol de decisión auxiliar que explica la clasificación.
- **Modo 2 — Escucha en tiempo real (WebSocket):** reproduce secuencias temporales que incluyen ataques reales del dataset, emitiendo predicciones segundo a segundo y generando alertas cuando se detecta una intrusión.

### Arquitectura

```
[React App — localhost:3000]
         │
         ├── REST  /casos, /predict/{caso_id}, /feature_stats ──►  [FastAPI — localhost:8000]
         ├── WS    /ws/escucha/{seq_id}                                  │
         │                                                       ├── GradientBoosting (gb_produccion.pkl)
         ◄── respuesta:                                          ├── SHAP TreeExplainer
             {                                                   └── Árbol de decisión auxiliar
               prediccion: "Ataque",                                 (dt_auxiliar.pkl, max_depth=5)
               probabilidad: 0.87,
               shap_values: [...],
               regla: ["avg_conn < ...", "lit401_low = 1"],
               ...
             }
         │
         ▼
[React renderiza]
    ├── Tarjeta de resultado (Normal/Ataque + probabilidad)
    ├── Gráfica SHAP de barras horizontales (Recharts)
    ├── Regla de decisión formateada
    └── Modo escucha con línea temporal y alertas
```

### Endpoints del backend

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health check (modelo, nº de features y casos cargados) |
| GET | `/casos` | Lista de casos predefinidos del Modo 1 |
| GET | `/predict/{caso_id}` | Predicción + SHAP + regla DT para un caso |
| GET | `/feature_stats` | Estadísticas de las features (para contextualizar valores) |
| GET | `/secuencias` | Lista de secuencias temporales disponibles |
| WS | `/ws/escucha/{seq_id}` | Streaming de predicciones para una secuencia (Modo 2) |

### Ejecución en local

**Backend** (requiere Python 3.11+):

```bash
cd swat-backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

**Frontend** (requiere Node.js):

```bash
cd swat-frontend
npm install
npm start
```

La aplicación queda disponible en `http://localhost:3000` y consume la API en `http://localhost:8000`.

---

## Estructura del repositorio

```
/
├── 01_Primeros_pasos.ipynb
├── 02_Analisis_Descriptivo_Datos.ipynb
├── 03_ProcesaminetoTemporalWS.ipynb
├── 04_Medidas_Fisicas.ipynb
├── 04b_Limpieza_Datos_Fisicos.ipynb
├── 05_Union_y_Filstrado_FisicosRed.ipynb
├── 06_EDA_Features_Red.ipynb
├── 06B_EDA_Features_Fisicas.ipynb
├── 07_Feature_Engineering_Red.ipynb
├── 07B_Feature_Engineering_Fisicos.ipynb
├── 08_Modelo_RF_Simplificado_FN.ipynb
├── 08B_Modelo_RF_Simplificado_Fisicos.ipynb
├── 09_Modelo_RandomForest_SCADA_v2.ipynb
├── 10_JOIN_DATOS.ipynb
├── 11_Cross_Validation.ipynb
├── 12_Comparativa_Modelos.ipynb
├── 13_Etreno_Modelo_Produccion.ipynb
│
├── swat-backend/                  # API FastAPI
│   ├── app.py                     # Endpoints REST + WebSocket
│   ├── gb_produccion.pkl          # Modelo Gradient Boosting de producción
│   ├── dt_auxiliar.pkl            # Árbol de decisión auxiliar (explicabilidad)
│   ├── casos_modo1.json           # Casos predefinidos (Modo 1)
│   ├── secuencias_escucha.json    # Secuencias temporales (Modo 2)
│   ├── feature_stats.json         # Estadísticas de features
│   ├── background_sample.json     # Muestra de fondo para SHAP
│   └── requirements.txt
│
└── swat-frontend/                 # Aplicación React
    ├── src/
    │   ├── App.js                 # Componente principal
    │   └── components/
    │       ├── ShapChart.jsx      # Gráfica de contribuciones SHAP
    │       ├── ReglaDecision.jsx  # Visualización de la regla del árbol
    │       └── ModoEscucha.jsx    # Modo de escucha en tiempo real (WS)
    └── package.json
```

---

## Tecnologías

- **Plataforma:** Databricks Free Edition (Serverless)
- **Procesamiento:** Apache Spark 4.1 + Delta Lake
- **ML:** scikit-learn, XGBoost, LightGBM, CatBoost
- **Explicabilidad:** SHAP (TreeExplainer) + árbol de decisión auxiliar
- **Backend:** FastAPI + Uvicorn (REST y WebSocket)
- **Frontend:** React 19 + Recharts + Axios
- **Lenguaje:** Python 3.11 / JavaScript

---

## Licencia y uso del dataset

El dataset SWaT pertenece a iTrust (SUTD) y no se incluye en este repositorio. Los artefactos publicados (modelos `.pkl` y ficheros JSON) son derivados generados para la demostración académica del TFG.

## Autor
Miguel Puerta Olivares
