import type { Currency } from '../types'

export function formatCurrencyCompact(value: number, currency: Currency = 'ARS'): string {
  const prefix = currency === 'ARS' ? 'AR$' : 'US$'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000_000) {
    return `${sign}${prefix} ${(abs / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  }
  if (abs >= 1_000_000) {
    return `${sign}${prefix} ${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  }
  if (abs >= 1_000) {
    return `${sign}${prefix} ${(abs / 1_000).toFixed(1).replace('.', ',')}K`
  }
  return `${sign}${prefix} ${abs.toFixed(0)}`
}

export function formatCurrencyFull(value: number, currency: Currency = 'ARS'): string {
  const prefix = currency === 'ARS' ? 'AR$' : 'US$'
  return `${prefix} ${value.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-AR')
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')}%`
}

// `new Date('YYYY-MM-DD')` interpreta como UTC midnight.
// En UTC-3 (Argentina) eso muestra el día anterior. Forzamos hora local agregando T00:00:00.
function parseDateLocal(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = parseDateLocal(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—'
  const d = parseDateLocal(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function formatMonthYear(value: string): string {
  const d = parseDateLocal(value)
  return d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
}

export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = parseDateLocal(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function isExpired(dateStr: string): boolean {
  return daysUntil(dateStr) < 0
}

export function isExpiringSoon(dateStr: string, days = 30): boolean {
  const d = daysUntil(dateStr)
  return d >= 0 && d <= days
}
