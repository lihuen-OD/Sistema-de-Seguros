// Puntajes 0-100 por estado de cada punto de control del checklist de
// auditoría — único lugar donde tocar los pesos si cambian los criterios.
// Las claves son los enums reales de fire-extinguisher-audits.constants.ts,
// no los labels en español.

export const CLEANLINESS_SCORES: Record<string, number> = {
  IMPECABLE: 100,
  LEVE_POLVO: 80,
  SUCIEDAD_VISIBLE: 50,
  MUY_SUCIO: 10,
  SUCIEDAD_ACUMULADA: 10,
}

export const CHARGE_FILL_SCORES: Record<string, number> = {
  CARGADO: 100,
  SOBRECARGADO: 30,
  DESCARGADO: 0,
}

export const HOSE_NOZZLE_SCORES: Record<string, number> = {
  SANA: 100,
  ROTA_LEVE: 60,
  ROTA_REQUIERE_CAMBIO: 0,
  NO_TIENE: 0,
}

// Chapa/soporte colapsa ROTA_LEVE/ROTA_REQUIERE_CAMBIO en un solo "Rota"
// (mismo criterio visual que CONDITION_TIERS en fire-extinguisher-audits.service.ts)
// — a diferencia de Manguera y Tobera, que sí distingue los 4 valores. Mismo
// puntaje para las dos poblaciones (Matafuegos/Activos) — ver
// fire-extinguisher-audits.population.ts; ajustable a futuro si el negocio
// pide un peso distinto para "soporte/abrazadera" vs "chapa baliza".
export const MOUNTING_CONDITION_SCORES: Record<string, number> = {
  SANA: 100,
  ROTA_LEVE: 40,
  ROTA_REQUIERE_CAMBIO: 40,
  NO_TIENE: 0,
}

// Compartido por Precinto (sealStatus) y Anillo (ringStatus) — mismo set de valores.
export const HAS_STATUS_SCORES: Record<string, number> = {
  TIENE: 100,
  NO_TIENE: 0,
}

// Claves de computeFireExtinguisherStatus (fire-extinguishers.expiration.ts).
export const EXPIRATION_SCORES: Record<string, number> = {
  vigente: 100,
  proximo_vencer: 60,
  sin_fecha: 30,
  vencido: 0,
}

// Escala de lectura — único lugar para cambiar los cortes.
export const LEVEL_SCALE = { critico: 50, regular: 75, bueno: 90 } as const

export function classifyLevel(level: number | null): string | null {
  if (level == null) return null
  if (level < LEVEL_SCALE.critico) return 'Crítico'
  if (level < LEVEL_SCALE.regular) return 'Regular'
  if (level < LEVEL_SCALE.bueno) return 'Bueno'
  return 'Óptimo'
}

// Orden canónico de los 7 puntos de control — mismos labels que
// findingsReportFields.ts (frontend) para no introducir un nombre distinto
// para el mismo concepto. El label de `mountingCondition` acá es el de la
// población ESTABLISHMENT (Matafuegos) — ver controlPointLabel() para el de
// la población ASSET (Activos).
export const CONTROL_POINT_DEFS = [
  { key: 'cleanliness', label: 'Limpieza' },
  { key: 'chargeFillStatus', label: 'Carga' },
  { key: 'hoseNozzleCondition', label: 'Manguera y tobera' },
  { key: 'mountingCondition', label: 'Chapa baliza' },
  { key: 'sealStatus', label: 'Precinto' },
  { key: 'ringStatus', label: 'Anillo' },
  { key: 'expiration', label: 'Vencimiento de carga' },
] as const

export type ControlPointKey = (typeof CONTROL_POINT_DEFS)[number]['key']

// Único punto de control cuyo rótulo cambia según la población — "Chapa
// Baliza" tiene sentido en la pared de un edificio, "Soporte / Abrazadera"
// en un vehículo/maquinaria (mismo campo, mismos valores; ver
// fire-extinguisher-audits.population.ts).
export function controlPointLabel(key: ControlPointKey, population: 'ESTABLISHMENT' | 'ASSET'): string {
  if (key === 'mountingCondition' && population === 'ASSET') return 'Soporte / Abrazadera'
  return CONTROL_POINT_DEFS.find((def) => def.key === key)!.label
}
