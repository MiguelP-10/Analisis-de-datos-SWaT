import { useState, useEffect, useRef } from 'react';
import ShapChart from './ShapChart';
import ReglaDecision from './ReglaDecision';

const WS_BASE = 'ws://127.0.0.1:8000/ws/escucha';
const API = 'http://127.0.0.1:8000';

export default function ModoEscucha({ onBack }) {
  const [secuencias, setSecuencias] = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [secuenciaAnterior, setSecuenciaAnterior] = useState(null);
  const [estado, setEstado] = useState('idle'); // idle | corriendo | alerta | fin
  const [registros, setRegistros] = useState([]);
  const [alerta, setAlerta] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const wsRef = useRef(null);
  const listaRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/secuencias`)
      .then((r) => r.json())
      .then(setSecuencias);
  }, []);

  // Auto-scroll al último registro
  useEffect(() => {
    if (listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight;
    }
  }, [registros]);

  const iniciarEscucha = (seq) => {
    if (wsRef.current) wsRef.current.close();
    setSeleccionada(seq);
    setRegistros([]);
    setAlerta(null);
    setProgreso(0);
    setEstado('corriendo');

    const ws = new WebSocket(`${WS_BASE}/${seq.id}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.tipo === 'registro') {
        setRegistros((prev) => [...prev, msg]);
        setProgreso(Math.round(((msg.idx + 1) / seq.n_total) * 100));

        if (msg.prediccion === 'Ataque') {
          console.log('Mensaje de ataque:', msg); // añadir esto
          console.log('explicacion_simple:', msg.explicacion_simple); // añadir esto
          setAlerta(msg);
          setEstado('alerta');
        }
      }

      if (msg.tipo === 'alerta') {
        setEstado('alerta');
      }

      if (msg.tipo === 'fin') {
        setEstado((prev) => (prev === 'alerta' ? 'alerta' : 'fin'));
      }
    };

    ws.onerror = () => setEstado('idle');
  };

  const detener = () => {
    if (wsRef.current) wsRef.current.close();
    setEstado('idle');
  };

  const reiniciar = () => {
    setSecuenciaAnterior(seleccionada);
    setEstado('idle');
    setSeleccionada(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-title">Modo escucha — Detección en tiempo real</div>
          <div className="header-sub">Secure Water Treatment · Simulación segundo a segundo</div>
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

      <div className="escucha-layout">
        {/* Panel izquierdo — selección de secuencia */}
        <aside className="casos-panel">
          <div className="casos-panel-title">Secuencias disponibles — {secuencias.length}</div>
          {secuencias.map((seq) => (
            <div
              key={seq.id}
              className={`caso-item ${seleccionada?.id === seq.id ? 'selected' : ''}`}
              onClick={() => (estado === 'idle' || estado === 'fin' ? iniciarEscucha(seq) : null)}
              style={{
                opacity:
                  (estado === 'corriendo' || estado === 'alerta') && seleccionada?.id !== seq.id
                    ? 0.4
                    : 1,
              }}
            >
              <span className="caso-badge ataque">⚠ CONTIENE ATAQUE</span>
              <span className="caso-tipo">{seq.nombre}</span>
              <span className="caso-ts">{seq.descripcion}</span>
              <div className="seq-meta">
                <span>{seq.n_normal}s normal</span>
                <span>+</span>
                <span>{seq.n_ataque}s ataque</span>
              </div>
            </div>
          ))}
        </aside>

        {/* Panel derecho — visualización */}
        <main className="result-panel">
          {/* Estado idle SIN datos previos */}
          {estado === 'idle' && registros.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">◎</div>
              <div className="empty-state-text">
                Selecciona una secuencia para iniciar la escucha
              </div>
            </div>
          )}

          {/* Estado idle CON datos previos — mantener visible */}
          {estado === 'idle' && registros.length > 0 && (
            <div className="escucha-resultado-anterior">
              <div className="card-title" style={{ marginBottom: '1rem' }}>
                ◈ Resultado de la secuencia anterior — selecciona una nueva para continuar
              </div>
              {/* Aquí reutilizamos el mismo contenido que cuando hay alerta */}
            </div>
          )}

          {/* Corriendo o alerta */}
          {(estado === 'corriendo' ||
            estado === 'alerta' ||
            estado === 'fin' ||
            (estado === 'idle' && registros.length > 0)) &&
            (seleccionada || registros.length > 0) && (
              <>
                {/* Header de secuencia activa */}
                <div className="escucha-header">
                  <div>
                    <div className="escucha-nombre">
                      {seleccionada?.nombre || secuenciaAnterior?.nombre}
                    </div>
                    <div className="escucha-desc">
                      {seleccionada?.descripcion || secuenciaAnterior?.descripcion}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {estado === 'corriendo' && (
                      <div className="escucha-live">
                        <div className="escucha-live-dot" />
                        EN ESCUCHA
                      </div>
                    )}
                    {estado === 'corriendo' && (
                      <button className="back-btn" onClick={detener}>
                        ■ Detener
                      </button>
                    )}
                    {(estado === 'alerta' || estado === 'fin') && (
                      <button className="back-btn" onClick={reiniciar}>
                        ↺ Nueva secuencia
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="prob-bar" style={{ marginBottom: 0 }}>
                  <div
                    className={`prob-bar-fill ${estado === 'alerta' ? 'ataque' : 'normal'}`}
                    style={{ width: `${progreso}%`, transition: 'width 0.8s ease' }}
                  />
                </div>

                {/* ALERTA de ataque */}
                {estado === 'alerta' && alerta && (
                  <div className="escucha-alerta">
                    <div className="escucha-alerta-title">⚠ ATAQUE DETECTADO</div>
                    <div className="escucha-alerta-meta">
                      <span>
                        Timestamp: <strong>{alerta.timestamp}</strong>
                      </span>
                      <span>
                        Probabilidad: <strong>{(alerta.probabilidad * 100).toFixed(1)}%</strong>
                      </span>
                      <span>
                        Registro nº: <strong>{alerta.idx + 1}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Timeline de registros */}
                <div className="escucha-timeline-wrap">
                  <div className="card-title">
                    ◈ Timeline — {registros.length} registros procesados
                  </div>
                  <div className="escucha-timeline" ref={listaRef}>
                    {registros.map((r, i) => (
                      <div
                        key={i}
                        className={`escucha-tick ${r.prediccion === 'Ataque' ? 'tick-ataque' : 'tick-normal'}`}
                        title={`${r.timestamp} — ${r.prediccion} (${(r.probabilidad * 100).toFixed(1)}%)`}
                      />
                    ))}
                  </div>
                  <div className="escucha-timeline-labels">
                    <span>Normal</span>
                    <span>Ataque</span>
                  </div>
                </div>

                {/* Lista de últimos registros */}
                <div className="shap-card">
                  <div className="card-title">◈ Últimos registros</div>
                  <div className="escucha-log" ref={listaRef}>
                    {registros.slice(-15).map((r, i) => (
                      <div
                        key={i}
                        className={`escucha-log-row ${r.prediccion === 'Ataque' ? 'log-ataque' : 'log-normal'}`}
                      >
                        <span className="escucha-log-ts">{r.timestamp.split(' ')[1]}</span>
                        <span
                          className={`caso-badge ${r.prediccion === 'Ataque' ? 'ataque' : 'normal'}`}
                        >
                          {r.prediccion === 'Ataque' ? '⚠ ATAQUE' : '✓ NORMAL'}
                        </span>
                        <span className="escucha-log-prob">
                          {(r.probabilidad * 100).toFixed(1)}%
                        </span>
                        <span
                          className="escucha-log-real"
                          style={{
                            color: r.label_real === 1 ? 'var(--danger)' : 'var(--safe)',
                            fontSize: '0.68rem',
                          }}
                        >
                          real: {r.label_real === 1 ? 'Ataque' : 'Normal'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
        </main>
      </div>
      {estado === 'alerta' && alerta && (
        <AlertaOverlay alerta={alerta} onNuevaSecuencia={reiniciar} />
      )}
    </div>
  );
}

function AlertaOverlay({ alerta, onNuevaSecuencia }) {
  if (!alerta) return null;

  return (
    <div className="alerta-overlay">
      <div className="alerta-modal">
        <div className="alerta-modal-header">
          <div>
            <div className="alerta-modal-title">⚠ ATAQUE DETECTADO</div>
            <div className="alerta-modal-subtitle">
              El modelo ha detenido la escucha al detectar comportamiento anómalo.
            </div>
          </div>

          <button className="back-btn" onClick={onNuevaSecuencia}>
            ↺ Nueva secuencia
          </button>
        </div>

        <div className="alerta-modal-meta">
          <div>
            <span className="meta-label">Timestamp</span>
            <span className="meta-value">{alerta.timestamp}</span>
          </div>
          <div>
            <span className="meta-label">Probabilidad de ataque</span>
            <span className="meta-value">{(alerta.probabilidad * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="meta-label">Registro</span>
            <span className="meta-value">#{alerta.idx + 1}</span>
          </div>
          <div>
            <span className="meta-label">Label real</span>
            <span
              className="meta-value"
              style={{
                color: alerta.label_real === 1 ? 'var(--danger)' : 'var(--safe)',
              }}
            >
              {alerta.label_real === 1 ? 'Ataque' : 'Normal'}
            </span>
          </div>
        </div>

        {/* Valor final vs umbral */}
        <div className="umbral-row" style={{ margin: '0.75rem 0' }}>
          <div className="umbral-item">
            <span className="umbral-label">Valor del modelo</span>
            <span className="umbral-valor" style={{ color: 'var(--danger)' }}>
              {alerta.probabilidad.toFixed(4)}
            </span>
          </div>
          <div className="umbral-comparador">
            <span className="umbral-gt">&gt;</span>
          </div>
          <div className="umbral-item">
            <span className="umbral-label">Umbral</span>
            <span className="umbral-valor" style={{ color: 'var(--text2)' }}>
              0.2
            </span>
          </div>
          <div
            className="umbral-resultado"
            style={{
              background: 'rgba(198,40,40,0.08)',
              border: '1px solid rgba(198,40,40,0.3)',
            }}
          >
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>→ ATAQUE</span>
          </div>
        </div>

        <div className="alerta-explicacion">
          <div className="card-title">EXPLICACIÓN PARA TÉCNICO DE PLANTA</div>
          {alerta.explicacion_simple && <ExplicacionLista texto={alerta.explicacion_simple} />}
        </div>

        {alerta.shap_values && (
          <ShapChart shap_values={alerta.shap_values} shap_base={alerta.shap_base} />
        )}

        {alerta.regla && (
          <ReglaDecision
            regla={alerta.regla}
            prediccion_dt={alerta.prediccion === 'Ataque' ? 'Ataque' : 'Normal'}
          />
        )}
      </div>
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
