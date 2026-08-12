import type { Currency } from '../types'

// Convierte un monto de la moneda del formulario a la otra, para mostrar el
// equivalente al lado del campo (ej. si currency es ARS, muestra el
// equivalente en USD usando el tipo de cambio ingresado, y viceversa).
export function computeEquivalent(rawAmount: string, currency: Currency, exchangeRate: string): string {
  const amount = parseFloat(rawAmount)
  const rate = parseFloat(exchangeRate)
  if (isNaN(amount) || isNaN(rate) || rate <= 0) return ''
  return currency === 'ARS' ? (amount / rate).toFixed(2) : (amount * rate).toFixed(2)
}
