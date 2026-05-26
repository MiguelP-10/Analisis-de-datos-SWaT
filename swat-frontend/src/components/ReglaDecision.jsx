export default function ReglaDecision({ regla, prediccion_dt }) {
  if (!regla || regla.length === 0) return null;

  const esAtaque = prediccion_dt === 'Ataque';

  return (
    <div className="regla-card">
      <div className="card-title">◈ Regla de decisión — Decision Tree</div>

      {regla.map((paso, i) => {
        const isPos = paso.shap_value >= 0;
        return (
          <div key={i} className="regla-step">
            <div className="regla-num">{i + 1}</div>
            <div className="regla-cond">
              {paso.feature} <span>{paso.condicion.replace(paso.feature, '').trim()}</span>{' '}
              <span style={{ color: 'var(--text2)', fontSize: '0.68rem' }}>
                (valor: {paso.valor})
              </span>
            </div>
            <div className={`regla-shap ${isPos ? 'pos' : 'neg'}`}>
              {isPos ? '+' : ''}
              {paso.shap_value.toFixed(3)}
            </div>
          </div>
        );
      })}

      <div className={`regla-veredicto ${esAtaque ? 'ataque' : 'normal'}`}>
        {esAtaque ? '⚠' : '✓'}
        Decision Tree predice: <strong>{prediccion_dt}</strong>
      </div>
    </div>
  );
}
