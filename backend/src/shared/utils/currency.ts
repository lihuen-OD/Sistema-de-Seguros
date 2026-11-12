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

// Piso de plausibilidad para un tipo de cambio ARS por USD: 1 es el default
// de columna (`exchangeRate @default(1)`) que quedó en los datos anteriores a
// la feature de TC, no una cotización real — cualquier TC ≤ 1 se trata como
// "sin TC confiable" en vez de usarse para convertir.
export const MIN_PLAUSIBLE_ARS_PER_USD = 1

export function isPlausibleArsPerUsd(rate: number | null | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > MIN_PLAUSIBLE_ARS_PER_USD
}
