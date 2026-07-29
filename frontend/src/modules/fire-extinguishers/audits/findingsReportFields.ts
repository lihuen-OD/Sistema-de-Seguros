export function sectorKey(establishment: string, locationType: string): string {
  return `${establishment}::${locationType}`
}

export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
