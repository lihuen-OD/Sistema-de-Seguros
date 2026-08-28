export function sectorKey(establishment: string, locationType: string): string {
  return `${establishment}::${locationType}`
}

export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Versión corta para encabezados de columna angostos (heatmap de historial) —
// ej. "Ago '26" en vez de "Agosto de 2026".
export function formatPeriodLabelShort(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'short' })
  return `${label.charAt(0).toUpperCase()}${label.slice(1).replace('.', '')} '${String(year).slice(2)}`
}

// Agrupación genérica por establecimiento — reusada donde solo hace falta
// juntar filas bajo su establecimiento (ej. la tabla de historial de
// limpieza), a diferencia del groupByEstablishment de
// FireExtinguisherFindingsReportPage.tsx, que además suma total/audited.
export function groupByEstablishment<T extends { establishment: string }>(items: T[]): { establishment: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    if (!map.has(item.establishment)) map.set(item.establishment, [])
    map.get(item.establishment)!.push(item)
  }
  return [...map.entries()].map(([establishment, groupItems]) => ({ establishment, items: groupItems }))
}
