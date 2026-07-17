import type { FireExtinguisherFindingsField } from '../../../shared/api/fire-extinguisher-audits.api'

export interface FindingsFieldDef {
  key: FireExtinguisherFindingsField
  label: string
  tierOrder: string[]
  goodTier: string
}

// Limpieza, Carga y Manguera y Tobera son los campos "principales" del
// informe — categorías reales tal cual se cargan en la auditoría (nada
// colapsado), con los matafuegos nombrados en cada categoría problemática.
export const PRIMARY_FIELDS: FindingsFieldDef[] = [
  {
    key: 'cleanliness',
    label: 'Limpieza',
    tierOrder: ['Impecable', 'Polvo leve', 'Suciedad visible', 'Muy sucio', 'Suciedad acumulada con el tiempo'],
    goodTier: 'Impecable',
  },
  {
    key: 'chargeFillStatus',
    label: 'Carga',
    tierOrder: ['Cargados', 'Descargados', 'Sobrecargados'],
    goodTier: 'Cargados',
  },
  {
    key: 'hoseNozzleCondition',
    label: 'Manguera y tobera',
    tierOrder: ['Sana', 'Rota (leve)', 'Rota (requiere cambio)', 'No tiene'],
    goodTier: 'Sana',
  },
]

// Chapa Baliza, Precinto, Anillo y Vencimiento son "secundarios" — se
// muestran simples (solo números), sin nombrar matafuegos.
export const SECONDARY_FIELDS: FindingsFieldDef[] = [
  { key: 'beaconPlateCondition', label: 'Chapa baliza', tierOrder: ['Sana', 'Rota', 'No tiene'], goodTier: 'Sana' },
  { key: 'sealStatus', label: 'Precinto', tierOrder: ['Tiene', 'No tiene'], goodTier: 'Tiene' },
  { key: 'ringStatus', label: 'Anillo', tierOrder: ['Tiene', 'No tiene'], goodTier: 'Tiene' },
  {
    key: 'expiration',
    label: 'Vencimiento de carga',
    tierOrder: ['Vigente', 'Próximo a vencer', 'Vencido'],
    goodTier: 'Vigente',
  },
]

// Verde (todo bien) → rojo oscuro (lo más grave) — mismo orden que tierOrder.
export const TIER_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#b91c1c']

export function sectorKey(establishment: string, locationType: string): string {
  return `${establishment}::${locationType}`
}

export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
