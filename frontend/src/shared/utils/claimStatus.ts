import type { ElementType } from 'react'
import { CLAIM_STATUS_STYLES, CLAIM_STATUS_ICONS, CLAIM_STATUS_DEFAULT_STYLE, CLAIM_STATUS_DEFAULT_ICON } from '../constants/claim-status'

// Los estados de siniestro son texto libre configurable por el admin
// (catálogo claim_status, ver catalogQueries.byCategory('claim_status')) —
// nunca un enum fijo, y el mismo estado puede llegar escrito distinto según
// el ambiente (ej. "En trámite" en local, "EN TRAMITE" en producción). Estas
// funciones comparan/resuelven por el significado normalizado, nunca por
// texto exacto — un estado que no matchea ninguno de los conocidos en
// CLAIM_STATUS_STYLES cae al estilo/ícono neutro por defecto, nunca se
// excluye ni se inventa una categoría para él.
// Mismo criterio que normalizeKey en insuranceDashboardCalc.ts (y su
// equivalente en el backend, fire-extinguishers.service.ts#normalizeKey) —
// el rango unicode son los diacríticos combinantes que deja normalize('NFD').
const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalizeClaimStatusText(status: string | null | undefined): string {
  return (status ?? '')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function claimStatusEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeClaimStatusText(a) === normalizeClaimStatusText(b)
}

const KNOWN_CLAIM_STATUS_KEYS = Object.keys(CLAIM_STATUS_STYLES)

// Clave conocida (una de CLAIM_STATUS_STYLES/CLAIM_STATUS_ICONS) que matchea
// el status real normalizado, o el propio status sin tocar si es nuevo —  en
// ese caso los Records de estilo/ícono no lo van a tener como clave y el
// llamador cae solo al default neutro. Nunca se usa para decidir qué texto
// se muestra (eso siempre es el status real, verbatim).
export function resolveClaimStatusKey(status: string | null | undefined): string {
  if (!status) return ''
  return KNOWN_CLAIM_STATUS_KEYS.find((key) => claimStatusEquals(key, status)) ?? status
}

export function getClaimStatusIcon(status: string | null | undefined): ElementType {
  return CLAIM_STATUS_ICONS[resolveClaimStatusKey(status)] ?? CLAIM_STATUS_DEFAULT_ICON
}

export function getClaimStatusStyle(status: string | null | undefined): string {
  return CLAIM_STATUS_STYLES[resolveClaimStatusKey(status)] ?? CLAIM_STATUS_DEFAULT_STYLE
}

// Colores para el gráfico "Siniestros por estado" (recharts <Cell fill>, no
// puede tomar clases Tailwind) — misma semántica que CLAIM_STATUS_STYLES:
// gestión en azul/ámbar, resolución en verde/rojo, cualquier otro estado
// (incluido uno nuevo agregado por el admin) en gris neutro.
const KNOWN_CLAIM_STATUS_CHART_COLORS: Record<string, string> = {
  'Sin denunciar': '#94a3b8',
  'Denunciado':    '#2563eb',
  'En trámite':    '#f59e0b',
  'Liquidado':     '#10b981',
  'Rechazado':     '#ef4444',
  'Cerrado':       '#94a3b8',
}
const CLAIM_STATUS_DEFAULT_CHART_COLOR = '#94a3b8'

export function getClaimStatusChartColor(status: string | null | undefined): string {
  return KNOWN_CLAIM_STATUS_CHART_COLORS[resolveClaimStatusKey(status)] ?? CLAIM_STATUS_DEFAULT_CHART_COLOR
}
