import { useState } from 'react';
import axios from 'axios';
import './App.css';
import ShapChart from './components/ShapChart';
import ReglaDecision from './components/ReglaDecision';
import ModoEscucha from './components/ModoEscucha';

const API = 'http://127.0.0.1:8000';

export default function App() {
  const [modo, setModo] = useState(null); // null | 'casos' | 'escucha'

  if (!modo) return <Dashboard onSelect={setModo} />;
  if (modo === 'casos') return <ModoCasos onBack={() => setModo(null)} />;
  if (modo === 'escucha') return <ModoEscucha onBack={() => setModo(null)} />;
}

// ── DASHBOARD PRINCIPAL
function Dashboard({ onSelect }) {
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-title">Sistema de Detección de Intrusiones — SWaT</div>
          <div className="header-sub">
            Secure Water Treatment · Análisis de tráfico de red SCADA
          </div>
        </div>
        <div className="header-status">
          <div className="header-dot" />
          Sistema operativo
        </div>
      </header>

      <div className="dashboard">
        <div className="dashboard-intro">
          <div className="dashboard-intro-title">Seleccione el modo de análisis</div>
          <div className="dashboard-intro-sub">
            El sistema utiliza un modelo Gradient Boosting entrenado sobre datos combinados de red
            SCADA y sensores físicos del sistema SWaT. Incorpora explicabilidad mediante SHAP values
            y reglas de decisión.
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="dashboard-card" onClick={() => onSelect('casos')}>
            <div className="dashboard-card-icon">◈</div>
            <div className="dashboard-card-title">Casos de uso</div>
            <div className="dashboard-card-desc">
              Analiza 10 registros reales seleccionados del dataset SWaT. Incluye ataques de
              distintos tipos — manipulación de nivel, corte de caudal, presión anómala — y periodos
              normales de referencia.
            </div>
            <div className="dashboard-card-meta">
              <span>10 casos predefinidos</span>
              <span>Respuesta inmediata</span>
            </div>
            <div className="dashboard-card-action">Acceder →</div>
          </div>

          <div className="dashboard-card" onClick={() => onSelect('escucha')}>
            <div className="dashboard-card-icon dashboard-card-icon-dim">◎</div>
            <div className="dashboard-card-title">Modo escucha</div>
            <div className="dashboard-card-desc">
              Simulación de detección en tiempo real. El sistema procesa datos segundo a segundo a
              partir de un instante temporal seleccionado y emite alerta cuando detecta un ataque.
            </div>
            <div className="dashboard-card-meta">
              <span>5 secuencias temporales</span>
              <span>Simulación en tiempo real</span>
            </div>
            <div className="dashboard-card-action dashboard-card-action-dim">Acceder →</div>
          </div>
        </div>

        <div className="dashboard-footer">
          <div className="dashboard-footer-item">
            <span className="dashboard-footer-label">Modelo</span>
            <span className="dashboard-footer-value">Gradient Boosting — 100 estimadores</span>
          </div>
          <div className="dashboard-footer-item">
            <span className="dashboard-footer-label">Features</span>
            <span className="dashboard-footer-value">21 (red + físicos)</span>
          </div>
          <div className="dashboard-footer-item">
            <span className="dashboard-footer-label">AUC-ROC</span>
            <span className="dashboard-footer-value">1.0 (K-Fold CV K=5)</span>
          </div>
          <div className="dashboard-footer-item">
            <span className="dashboard-footer-label">Detección</span>
            <span className="dashboard-footer-value">99.08% — Falsa alarma 0.01%</span>
          </div>
          <div className="dashboard-footer-item">
            <span className="dashboard-footer-label">Dataset</span>
            <span className="dashboard-footer-value">SWaT — iTrust, SUTD Singapore</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MODO CASOS
function ModoCasos({ onBack }) {
  const [casos, setCasos] = useState([]);
  const [casosCargados, setCargados] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useState(() => {
    axios
      .get(`${API}/casos`)
      .then((r) => {
        setCasos(r.data);
        setCargados(true);
      })
      .catch(() => setError('No se puede conectar con el backend'));
  }, []);

  const seleccionarCaso = async (caso) => {
    setSeleccionado(caso.id);
    setResultado(null);
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${API}/predict/${caso.id}`);
      setResultado(r.data);
    } catch {
      setError('Error al obtener predicción');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-title">Casos de uso — Análisis individual</div>
          <div className="header-sub">
            Secure Water Treatment · Análisis de tráfico de red SCADA
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="header-status">
            <div className="header-dot" />
            Sistema operativo
          </div>
          <button className="back-btn" onClick={onBack}>
            ← Volver al inicio
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="casos-panel">
          <div className="casos-panel-title">Casos de uso — {casos.length} registros</div>
          {!casosCargados && (
            <div className="loading">
              <div className="spinner" /> Cargando casos...
            </div>
          )}
          {casos.map((caso) => (
            <div
              key={caso.id}
              className={`caso-item ${seleccionado === caso.id ? 'selected' : ''}`}
              onClick={() => seleccionarCaso(caso)}
            >
              <span className={`caso-badge ${caso.label_real === 1 ? 'ataque' : 'normal'}`}>
                {caso.label_real === 1 ? '⚠ ATAQUE' : '✓ NORMAL'}
              </span>
              <span className="caso-tipo">{caso.tipo}</span>
              <span className="caso-ts">{caso.timestamp}</span>
            </div>
          ))}
        </aside>

        <main className="result-panel">
          {error && (
            <div className="regla-veredicto ataque" style={{ marginBottom: 0 }}>
              ⚠ {error}
            </div>
          )}
          {!seleccionado && !error && (
            <div className="empty-state">
              <div className="empty-state-icon">◈</div>
              <div className="empty-state-text">Selecciona un caso para analizar</div>
            </div>
          )}
          {loading && (
            <div className="loading">
              <div className="spinner" />
              Analizando registro...
            </div>
          )}
          {resultado && !loading && (
            <>
              <ResultCard resultado={resultado} />
              <ShapChart shap_values={resultado.shap_values} shap_base={resultado.shap_base} />
              <ReglaDecision regla={resultado.regla} prediccion_dt={resultado.prediccion_dt} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── RESULT CARD
function ResultCard({ resultado }) {
  const esAtaque = resultado.prediccion === 'Ataque';
  const cls = esAtaque ? 'ataque' : 'normal';
  const pct = (resultado.probabilidad * 100).toFixed(1);

  return (
    <div className={`result-card ${cls}`}>
      <div className="result-header">
        <div className={`result-veredicto ${cls}`}>
          {esAtaque ? '⚠ ATAQUE DETECTADO' : '✓ TRÁFICO NORMAL'}
        </div>
        <div className="result-prob">
          <div
            className="result-prob-value"
            style={{ color: esAtaque ? 'var(--danger)' : 'var(--safe)' }}
          >
            {pct}%
          </div>
          <div className="result-prob-label">prob. ataque</div>
        </div>
      </div>

      <div className="prob-bar">
        <div className={`prob-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>

      {/* Valor final vs umbral */}
      <div className="umbral-row">
        <div className="umbral-item">
          <span className="umbral-label">Valor del modelo</span>
          <span
            className="umbral-valor"
            style={{ color: esAtaque ? 'var(--danger)' : 'var(--safe)' }}
          >
            {resultado.probabilidad.toFixed(4)}
          </span>
        </div>
        <div className="umbral-comparador">
          <span className={esAtaque ? 'umbral-gt' : 'umbral-lt'}>{esAtaque ? '>' : '<'}</span>
        </div>
        <div className="umbral-item">
          <span className="umbral-label">Umbral de clasificación</span>
          <span className="umbral-valor" style={{ color: 'var(--text2)' }}>
            {resultado.umbral}
          </span>
        </div>
        <div
          className="umbral-resultado"
          style={{
            background: esAtaque ? 'rgba(198,40,40,0.08)' : 'rgba(46,125,50,0.08)',
            border: `1px solid ${esAtaque ? 'rgba(198,40,40,0.3)' : 'rgba(46,125,50,0.3)'}`,
          }}
        >
          <span style={{ color: esAtaque ? 'var(--danger)' : 'var(--safe)', fontWeight: 600 }}>
            → {esAtaque ? 'ATAQUE' : 'NORMAL'}
          </span>
        </div>
      </div>

      <div className="explicacion-simple">
        <div className="explicacion-simple-title"> EXPLICACIÓN PARA TÉCNICO DE PLANTA</div>
        {resultado.explicacion_simple && <ExplicacionLista texto={resultado.explicacion_simple} />}
      </div>

      <div className="result-meta">
        <div className="meta-item">
          <span className="meta-label">Timestamp</span>
          <span className="meta-value">{resultado.timestamp}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Label real</span>
          <span
            className="meta-value"
            style={{ color: resultado.label_real === 1 ? 'var(--danger)' : 'var(--safe)' }}
          >
            {resultado.label_real === 1 ? 'Ataque' : 'Normal'}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Umbral</span>
          <span className="meta-value">{resultado.umbral}</span>
        </div>
      </div>

      {/* <div className="result-meta"
           style={{ marginTop: '0.75rem', paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border)' }}>
        <div className="meta-item" style={{ gridColumn: '1 / -1' }}>
          <span className="meta-label">Descripción</span>
          <span className="meta-value"
                style={{ fontFamily: 'var(--sans)', fontSize: '0.85rem' }}>
            {resultado.descripcion}
          </span>
        </div>
      </div> */}

      {resultado.warnings.length > 0 && (
        <div className="warnings" style={{ marginTop: '1rem' }}>
          {resultado.warnings.map((w, i) => (
            <div key={i} className="warning-item">
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplicacionLista({ texto }) {
  const partes = texto
    .split('•')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const intro = partes[0];
  const factores = partes.slice(1);

  return (
    <div className="explicacion-simple-texto">
      <p style={{ marginBottom: '0.75rem' }}>{intro}</p>
      {factores.length > 0 && (
        <ul
          style={{
            paddingLeft: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          {factores.map((f, i) => (
            <li key={i} style={{ lineHeight: '1.55' }}>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
