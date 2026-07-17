export const FIRE_EXT_AUDIT_CLEANLINESS = [
  'IMPECABLE',
  'LEVE_POLVO',
  'SUCIEDAD_VISIBLE',
  'MUY_SUCIO',
  'SUCIEDAD_ACUMULADA',
] as const

export const FIRE_EXT_AUDIT_CHARGE_FILL_STATUS = ['CARGADO', 'DESCARGADO', 'SOBRECARGADO'] as const

// Fusiona "¿tiene chapa baliza?" + "estado de la chapa" en un solo campo.
export const FIRE_EXT_AUDIT_PLATE_CONDITION = ['SANA', 'ROTA_LEVE', 'ROTA_REQUIERE_CAMBIO', 'NO_TIENE'] as const

// Compartido por sealStatus y ringStatus (mismo set de valores).
export const FIRE_EXT_AUDIT_HAS_STATUS = ['TIENE', 'NO_TIENE'] as const

export const FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION = [
  'SANA',
  'ROTA_LEVE',
  'ROTA_REQUIERE_CAMBIO',
  'NO_TIENE',
] as const

// Campos del maestro que Paso 3 del wizard puede proponer modificar.
export const FIRE_EXT_AUDIT_MASTER_FIELDS = ['cylinderNumber', 'expirationDate', 'capacity', 'type', 'brand'] as const

export const FIRE_EXT_AUDIT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION'] as const

export const FIRE_EXT_AUDIT_PROPOSED_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'APPLIED'] as const

export type FireExtAuditCleanliness = (typeof FIRE_EXT_AUDIT_CLEANLINESS)[number]
export type FireExtAuditChargeFillStatus = (typeof FIRE_EXT_AUDIT_CHARGE_FILL_STATUS)[number]
export type FireExtAuditPlateCondition = (typeof FIRE_EXT_AUDIT_PLATE_CONDITION)[number]
export type FireExtAuditHasStatus = (typeof FIRE_EXT_AUDIT_HAS_STATUS)[number]
export type FireExtAuditHoseNozzleCondition = (typeof FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION)[number]
export type FireExtAuditMasterField = (typeof FIRE_EXT_AUDIT_MASTER_FIELDS)[number]
export type FireExtAuditStatus = (typeof FIRE_EXT_AUDIT_STATUSES)[number]
export type FireExtAuditProposedChangeStatus = (typeof FIRE_EXT_AUDIT_PROPOSED_CHANGE_STATUSES)[number]
