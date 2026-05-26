export default function ShapChart({ shap_values, shap_base }) {
  if (!shap_values || shap_values.length === 0) return null;

  const maxAbs = Math.max(...shap_values.map((s) => Math.abs(s.shap_value)));

  return (
    <div className="shap-card">
      <div className="card-title">◈ Contribución de features — SHAP values</div>

      {shap_values.map((s, i) => {
        const isPos = s.shap_value >= 0;
        const pct = (Math.abs(s.shap_value) / maxAbs) * 45;
        return (
          <div key={i} className="shap-row">
            <div className="shap-feat" title={s.feature}>
              {s.feature}
            </div>
            <div className="shap-bar-wrap">
              <div className="shap-bar-center" />
              <div className={`shap-bar ${isPos ? 'pos' : 'neg'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`shap-val ${isPos ? 'pos' : 'neg'}`}>
              {isPos ? '+' : ''}
              {s.shap_value.toFixed(3)}
            </div>
          </div>
        );
      })}

      <div className="shap-legend">
        <span>
          <span className="legend-dot" style={{ background: 'var(--accent)' }} />
          Empuja hacia Normal
        </span>
        <span>Base: {shap_base.toFixed(3)}</span>
        <span>
          <span className="legend-dot" style={{ background: 'var(--danger)' }} />
          Empuja hacia Ataque
        </span>
      </div>
    </div>
  );
}
