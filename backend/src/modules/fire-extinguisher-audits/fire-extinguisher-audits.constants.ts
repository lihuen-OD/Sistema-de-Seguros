export const FIRE_EXT_AUDIT_CLEANLINESS = [
  'IMPECABLE',
  'LEVE_POLVO',
  'SUCIEDAD_VISIBLE',
  'MUY_SUCIO',
  'SUCIEDAD_ACUMULADA',
] as const

export const FIRE_EXT_AUDIT_CHARGE_FILL_STATUS = ['CARGADO', 'DESCARGADO'] as const

export const FIRE_EXT_AUDIT_YES_NO = ['SI', 'NO'] as const

export const FIRE_EXT_AUDIT_PLATE_CONDITION = ['SANA', 'ROTA_LEVE', 'ROTA_REQUIERE_CAMBIO'] as const

export const FIRE_EXT_AUDIT_PRESSURE_STATUS = ['BIEN', 'BAJA', 'ALTA', 'NO_APLICA'] as const

// Compartido por sealStatus y ringStatus (mismo set de valores).
export const FIRE_EXT_AUDIT_HAS_STATUS = ['TIENE', 'NO_TIENE'] as const

export const FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION = [
  'SANA',
  'ROTA_LEVE',
  'ROTA_REQUIERE_CAMBIO',
  'NO_TIENE',
  'EN_MAL_ESTADO',
] as const

// Campos del maestro que Paso 3 del wizard puede proponer modificar.
export const FIRE_EXT_AUDIT_MASTER_FIELDS = ['cylinderNumber', 'expirationDate', 'capacity', 'type', 'brand'] as const

export const FIRE_EXT_AUDIT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION'] as const

export const FIRE_EXT_AUDIT_PROPOSED_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'APPLIED'] as const

export type FireExtAuditCleanliness = (typeof FIRE_EXT_AUDIT_CLEANLINESS)[number]
export type FireExtAuditChargeFillStatus = (typeof FIRE_EXT_AUDIT_CHARGE_FILL_STATUS)[number]
export type FireExtAuditYesNo = (typeof FIRE_EXT_AUDIT_YES_NO)[number]
export type FireExtAuditPlateCondition = (typeof FIRE_EXT_AUDIT_PLATE_CONDITION)[number]
export type FireExtAuditPressureStatus = (typeof FIRE_EXT_AUDIT_PRESSURE_STATUS)[number]
export type FireExtAuditHasStatus = (typeof FIRE_EXT_AUDIT_HAS_STATUS)[number]
export type FireExtAuditHoseNozzleCondition = (typeof FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION)[number]
export type FireExtAuditMasterField = (typeof FIRE_EXT_AUDIT_MASTER_FIELDS)[number]
export type FireExtAuditStatus = (typeof FIRE_EXT_AUDIT_STATUSES)[number]
export type FireExtAuditProposedChangeStatus = (typeof FIRE_EXT_AUDIT_PROPOSED_CHANGE_STATUSES)[number]
