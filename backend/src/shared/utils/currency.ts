// Dado un monto cargado en una moneda puntual + el tipo de cambio vigente en
// ese momento, calcula el cierre en ambas monedas (ARS y USD) para guardarlo.
// Único punto de verdad reutilizado por policies/documents/claims/assets — así
// Dashboard y Análisis Financiero/Económico siempre pueden sumar por columna
// (amountArs / amountUsd) sin reconvertir nada al mostrar.
export function computeDualAmounts(amount: number, currency: 'ARS' | 'USD', exchangeRate: number) {
  if (currency === 'USD') {
    return {
      amountArs: exchangeRate > 0 ? +(amount * exchangeRate).toFixed(2) : 0,
      amountUsd: amount,
    }
  }
  return {
    amountArs: amount,
    amountUsd: exchangeRate > 0 ? +(amount / exchangeRate).toFixed(2) : 0,
  }
}
