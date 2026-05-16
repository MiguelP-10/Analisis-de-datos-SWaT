# Detección de Intrusiones en Red SCADA — Dataset SWaT

Trabajo de Fin de Grado — Análisis de datos de red y físicos del sistema **SWaT (Secure Water Treatment)** para la detección de ataques ciberfísicos mediante Machine Learning.

---

## Descripción

Este repositorio contiene el pipeline completo de procesamiento de datos, análisis exploratorio, ingeniería de características y modelado desarrollado sobre el dataset SWaT del laboratorio **iTrust (SUTD, Singapur)**.

El sistema SWaT es una planta de tratamiento de agua industrial instrumentada con sensores físicos y red de comunicación SCADA/Modbus. El objetivo es detectar ataques ciberfísicos a partir del **tráfico de red**, apoyándose en los datos de sensores físicos para corregir y validar las etiquetas de ataque.

---

## Dataset

El dataset SWaT contiene dos fuentes de datos capturadas durante un experimento de 11 días (7 normales + 4 con ataques):

- **Datos de red** — tráfico SCADA/Modbus capturado en ~388 ficheros CSV (~388 millones de paquetes)
- **Datos físicos** — lecturas segundo a segundo de sensores y actuadores de la planta (2 ficheros Excel: operación normal y ataques)

> El dataset SWaT es de acceso restringido. Para solicitarlo: [iTrust, SUTD](https://itrust.sutd.edu.sg/itrust-labs_datasets/dataset_info/)

---

## Pipeline

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
```

---

---

## Notebooks

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

---

## Resultados principales

| Modelo | AUC-ROC | Detección | Falsa alarma | FN |
|---|---|---|---|---|
| LightGBM | 1.0 | 99.96% | 0.29% | 20 |
| XGBoost | 1.0 | 99.93% | 0.27% | 35 |
| CatBoost | 1.0 | 99.93% | 0.32% | 34 |
| Random Forest (6 features, solo red) | 0.9989 | 98.22% | 1.56% | 176 |
| Random Forest (físicos) | 0.9828 | 84.76% | 0.02% | 1.665 |

Evaluación mediante **Stratified K-Fold CV (K=5)** sobre el dataset combinado de 706.319 ventanas temporales.

---

## Tecnologías

- **Plataforma:** Databricks (Serverless)
- **Procesamiento:** Apache Spark 4.1 + Delta Lake
- **ML:** scikit-learn, XGBoost, LightGBM, CatBoost
- **Lenguaje:** Python 3.11

---

## Estructura del repositorio

```
/
├── 01_Primeros_pasos
├── 02_Analisis_Descriptivo_Datos
├── 03_ProcesaminetoTemporalWS
├── 04_Medidas_Fisicas
├── 04b_Limpieza_Datos_Fisicos
├── 05_Union_y_Filstrado_FisicosRed
├── 06_EDA_Features_Red
├── 06B_EDA_Features_Fisicas
├── 07_Feature_Engineering_Red
├── 07B_Feature_Engineering_Fisicos
├── 08_Modelo_RF_Simplificado_FN
├── 08B_Modelo_RF_Simplificado_Fisicos
├── 09_Modelo_RandomForest_SCADA_v2
├── 10_JOIN_DATOS
├── 11_Cross_Validation
└── 12_Comparativa_Modelos

```


--- 

## Estructura del repositorio

```
[React App — GitHub Pages]
         │
         ├── POST /predict  ──────────────────────────────►  [FastAPI backend — local o Railway]
         │   {features: {...}}                                        │
         │                                                    ├── llama a Databricks endpoint
         │                                                    │   → obtiene probabilidad
         │                                                    ├── calcula SHAP
         │                                                    └── extrae regla DT
         │
         ◄── responde con:
             {
               prediccion: "Ataque",
               probabilidad: 0.87,
               shap_values: [...],
               shap_base: -5.2,
               regla: ["avg_conn < 180M", "lit401_low = 1"],
               features_en_regla: [...]
             }
         │
         ▼
[React renderiza]
    ├── tarjeta resultado (Normal/Ataque + prob)
    ├── gráfica SHAP con barras horizontales (D3 o Recharts)
    └── regla de decisión formateada

```

> Los notebooks están en formato Databricks. Para importarlos: **Databricks Workspace → Import → seleccionar archivo**

---

## Autor

Miguel Puerta Olivares — Universidad de Castilla-La Mancha (UCLM)  
Escuela Superior de Ingeniería Informática de Albacete (ESIIAB)
