import { useState } from 'react';
import axios from 'axios';
import './App.css';
import ShapChart from './components/ShapChart';
import ReglaDecision from './components/ReglaDecision';

const API = 'http://127.0.0.1:8000';

export default function App() {
  const [casos, setCasos]           = useState([]);
  const [casosCargados, setCargados] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [resultado, setResultado]   = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  // Cargar lista de casos al montar
  useState(() => {
    axios.get(`${API}/casos`)
      .then(r => { setCasos(r.data); setCargados(true); })
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
          <div className="header-title">
            Sistema de Detección de Intrusiones — SWaT
          </div>
          <div className="header-sub">
            Secure Water Treatment · Análisis de tráfico de red SCADA
          </div>
        </div>
        <div className="header-status">
          <div className="header-dot" />
          Sistema operativo
        </div>
      </header>

      <div className="layout">
        {/* Panel izquierdo — lista de casos */}
        <aside className="casos-panel">
          <div className="casos-panel-title">
            Casos de uso — {casos.length} registros
          </div>
          {!casosCargados && (
            <div className="loading">
              <div className="spinner" /> Cargando casos...
            </div>
          )}
          {casos.map(caso => (
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

        {/* Panel derecho — resultado */}
        <main className="result-panel">
          {error && (
            <div className="regla-veredicto ataque" style={{ marginBottom: 0 }}>
              ⚠ {error}
            </div>
          )}

          {!seleccionado && !error && (
            <div className="empty-state">
              <div className="empty-state-icon">⬡</div>
              <div className="empty-state-text">
                Selecciona un caso para analizar
              </div>
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
              {/* Tarjeta de resultado */}
              <ResultCard resultado={resultado} />

              {/* SHAP */}
              <ShapChart
                shap_values={resultado.shap_values}
                shap_base={resultado.shap_base}
              />

              {/* Regla DT */}
              <ReglaDecision
                regla={resultado.regla}
                prediccion_dt={resultado.prediccion_dt}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Componente inline simple para la tarjeta de resultado
function ResultCard({ resultado }) {
  const esAtaque = resultado.prediccion === 'Ataque';
  const cls      = esAtaque ? 'ataque' : 'normal';
  const pct      = (resultado.probabilidad * 100).toFixed(1);

  return (
    <div className={`result-card ${cls}`}>
      <div className="result-header">
        <div className={`result-veredicto ${cls}`}>
          {esAtaque ? '⚠ ATAQUE DETECTADO' : '✓ TRÁFICO NORMAL'}
        </div>
        <div className="result-prob">
          <div className="result-prob-value" style={{ color: esAtaque ? 'var(--danger)' : 'var(--safe)' }}>
            {pct}%
          </div>
          <div className="result-prob-label">prob. ataque</div>
        </div>
      </div>

      <div className="prob-bar">
        <div
          className={`prob-bar-fill ${cls}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="result-meta">
        <div className="meta-item">
          <span className="meta-label">Timestamp</span>
          <span className="meta-value">{resultado.timestamp}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Label real</span>
          <span className="meta-value" style={{ color: resultado.label_real === 1 ? 'var(--danger)' : 'var(--safe)' }}>
            {resultado.label_real === 1 ? 'Ataque' : 'Normal'}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Umbral</span>
          <span className="meta-value">{resultado.umbral}</span>
        </div>
      </div>

      <div className="result-meta" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
        <div className="meta-item" style={{ gridColumn: '1 / -1' }}>
          <span className="meta-label">Descripción</span>
          <span className="meta-value" style={{ fontFamily: 'var(--sans)', fontSize: '0.85rem' }}>
            {resultado.descripcion}
          </span>
        </div>
      </div>

      {resultado.warnings.length > 0 && (
        <div className="warnings" style={{ marginTop: '1rem' }}>
          {resultado.warnings.map((w, i) => (
            <div key={i} className="warning-item">⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
