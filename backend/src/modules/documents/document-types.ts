// Tipos de documento contable controlados en backend — Fase 1 del refactor.
// Reemplaza el catálogo editable (CatalogItem category='document_type') como
// fuente de verdad del comportamiento de cada tipo. Fases 2-4 (cálculo de
// saldos, apply/cancel, allocations negativas, auditoría) reutilizarán estas
// mismas definiciones — por eso affectsLinkedBalance/relationType ya existen
// como metadata aunque en Fase 1 no tengan lógica de cálculo asociada.

export type DocumentStatus = 'ISSUED' | 'APPLIED' | 'CANCELLED' | 'OBSERVED'

export type PaymentStatus =
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'NOT_APPLICABLE'

export type RelationType = 'CREDITS' | 'DEBITS' | 'REPLACES' | 'ADJUSTS' | 'ENDORSES'

export type AdjustmentSign = 'POSITIVE' | 'NEGATIVE'

export type EconomicImpactType = 'NO_IMPACT' | 'INCREASES_COST' | 'DECREASES_COST' | 'PENDING_DEFINITION'

export interface DocumentTypeDef {
  key: string
  label: string
  requiresLinkedDocument: boolean
  linkedDocumentType?: string
  linkedDocumentLabel?: string
  hasInstallments: boolean
  hasPaymentStatus: boolean
  affectsLinkedBalance: boolean
  affectsLinkedDirection?: 'credit' | 'debit' | 'adjusts' | 'replaces'
  relationType?: RelationType
  requiresAdjustmentReason: boolean
  requiresAdjustmentSign: boolean
  // Endoso: se asocia a una póliza propia en vez de a otro documento, y no
  // tiene importes propios (el impacto económico, si existe, lo carga el
  // documento contable vinculado — ver requiresEconomicImpactType).
  requiresPolicy: boolean
  hasOwnAmounts: boolean
  requiresEconomicImpactType: boolean
  documentStatusOptions: DocumentStatus[]
  paymentStatusOptions: PaymentStatus[]
  isInternal: boolean
}

export const DOCUMENT_TYPES: Record<string, DocumentTypeDef> = {
  INVOICE: {
    key: 'INVOICE',
    label: 'Factura',
    requiresLinkedDocument: false,
    hasInstallments: true,
    hasPaymentStatus: true,
    affectsLinkedBalance: false,
    requiresAdjustmentReason: false,
    requiresAdjustmentSign: false,
    requiresPolicy: false,
    hasOwnAmounts: true,
    requiresEconomicImpactType: false,
    documentStatusOptions: ['ISSUED', 'CANCELLED', 'OBSERVED'],
    paymentStatusOptions: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'],
    isInternal: false,
  },

  CREDIT_NOTE: {
    key: 'CREDIT_NOTE',
    label: 'Nota de Crédito',
    requiresLinkedDocument: true,
    linkedDocumentType: 'INVOICE',
    linkedDocumentLabel: 'Factura de referencia',
    hasInstallments: false,
    hasPaymentStatus: false,
    affectsLinkedBalance: true,
    affectsLinkedDirection: 'credit',
    relationType: 'CREDITS',
    requiresAdjustmentReason: false,
    requiresAdjustmentSign: false,
    requiresPolicy: false,
    hasOwnAmounts: true,
    requiresEconomicImpactType: false,
    documentStatusOptions: ['ISSUED', 'APPLIED', 'CANCELLED'],
    paymentStatusOptions: ['NOT_APPLICABLE'],
    isInternal: false,
  },

  DEBIT_NOTE: {
    key: 'DEBIT_NOTE',
    label: 'Nota de Débito',
    requiresLinkedDocument: false,
    linkedDocumentType: 'INVOICE',
    linkedDocumentLabel: 'Factura asociada',
    hasInstallments: true,
    hasPaymentStatus: true,
    affectsLinkedBalance: true,
    affectsLinkedDirection: 'debit',
    relationType: 'DEBITS',
    requiresAdjustmentReason: false,
    requiresAdjustmentSign: false,
    requiresPolicy: false,
    hasOwnAmounts: true,
    requiresEconomicImpactType: false,
    // Antes no incluía APPLIED y afectaba el saldo de la factura vinculada
    // apenas emitida (ISSUED) — ahora requiere el mismo paso de aplicación
    // que Nota de Crédito y Asiento de Ajuste (ver documents-balance.service.ts).
    documentStatusOptions: ['ISSUED', 'APPLIED', 'CANCELLED', 'OBSERVED'],
    paymentStatusOptions: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'],
    isInternal: false,
  },

  ENDORSEMENT: {
    key: 'ENDORSEMENT',
    label: 'Endoso',
    requiresLinkedDocument: false,
    linkedDocumentLabel: 'Documento contable asociado',
    hasInstallments: false,
    hasPaymentStatus: false,
    affectsLinkedBalance: false,
    relationType: 'ENDORSES',
    requiresAdjustmentReason: false,
    requiresAdjustmentSign: false,
    requiresPolicy: true,
    hasOwnAmounts: false,
    requiresEconomicImpactType: true,
    documentStatusOptions: ['ISSUED', 'APPLIED', 'CANCELLED'],
    paymentStatusOptions: ['NOT_APPLICABLE'],
    isInternal: false,
  },

  REBILLING: {
    key: 'REBILLING',
    label: 'Refacturación',
    requiresLinkedDocument: true,
    linkedDocumentType: 'INVOICE',
    linkedDocumentLabel: 'Factura original a refacturar',
    hasInstallments: true,
    hasPaymentStatus: true,
    affectsLinkedBalance: true,
    affectsLinkedDirection: 'replaces',
    relationType: 'REPLACES',
    requiresAdjustmentReason: false,
    requiresAdjustmentSign: false,
    requiresPolicy: false,
    hasOwnAmounts: true,
    requiresEconomicImpactType: false,
    documentStatusOptions: ['ISSUED', 'CANCELLED'],
    paymentStatusOptions: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'],
    isInternal: false,
  },

  ADJUSTMENT_ENTRY: {
    key: 'ADJUSTMENT_ENTRY',
    label: 'Asiento de Ajuste',
    requiresLinkedDocument: true,
    linkedDocumentLabel: 'Documento a ajustar',
    hasInstallments: false,
    hasPaymentStatus: false,
    affectsLinkedBalance: true,
    affectsLinkedDirection: 'adjusts',
    relationType: 'ADJUSTS',
    requiresAdjustmentReason: true,
    requiresAdjustmentSign: true,
    requiresPolicy: false,
    hasOwnAmounts: true,
    requiresEconomicImpactType: false,
    documentStatusOptions: ['ISSUED', 'APPLIED', 'CANCELLED', 'OBSERVED'],
    paymentStatusOptions: ['NOT_APPLICABLE'],
    isInternal: true,
  },
}

export const ADJUSTMENT_REASONS: Record<string, string> = {
  ROUNDING_DIFFERENCE: 'Diferencia por redondeo',
  INTERNAL_COMPENSATION: 'Compensación interna',
  EXCHANGE_RATE_DIFFERENCE: 'Diferencia de cambio',
  ADMIN_CORRECTION: 'Corrección administrativa',
  BALANCE_RECLASSIFICATION: 'Reimputación de saldo',
  RESIDUAL_BALANCE: 'Saldo residual',
  OTHER: 'Otro',
}

// Puramente descriptivo — no cambia lógica de negocio, por eso vive como
// lista fija en backend (mismo criterio que ADJUSTMENT_REASONS) y no como
// catálogo editable en Configuración.
export const ENDORSEMENT_TYPES: Record<string, string> = {
  ASSET_ADDITION: 'Alta de activo',
  ASSET_REMOVAL: 'Baja de activo',
  COVERAGE_CHANGE: 'Modificación de cobertura',
  SUM_INSURED_CHANGE: 'Modificación de suma asegurada',
  VALIDITY_CHANGE: 'Cambio de vigencia',
  INSURED_DATA_CHANGE: 'Cambio de datos del asegurado',
  PRODUCER_CHANGE: 'Cambio de productor',
  ADMIN_CORRECTION: 'Corrección administrativa',
  PARTIAL_CANCELLATION: 'Anulación parcial',
  RENEWAL: 'Renovación',
  OTHER: 'Otro',
}

export const ECONOMIC_IMPACT_TYPES: Record<EconomicImpactType, string> = {
  NO_IMPACT: 'No tiene impacto económico',
  INCREASES_COST: 'Aumenta costo',
  DECREASES_COST: 'Reduce costo',
  PENDING_DEFINITION: 'Pendiente de definir',
}

// El Endoso no mueve saldo por sí mismo — cuando aumenta o reduce costo, ese
// impacto lo debe respaldar un documento contable del tipo correspondiente.
export const ENDORSEMENT_ALLOWED_LINKED_TYPES: Record<string, string[]> = {
  INCREASES_COST: ['INVOICE', 'DEBIT_NOTE'],
  DECREASES_COST: ['CREDIT_NOTE'],
}

export function getDocumentTypeDef(key: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES[key]
}

export function isValidDocumentType(key: string): boolean {
  return key in DOCUMENT_TYPES
}

export function isValidAdjustmentReason(key: string): boolean {
  return key in ADJUSTMENT_REASONS
}

export function isValidEndorsementType(key: string): boolean {
  return key in ENDORSEMENT_TYPES
}

export function isValidEconomicImpactType(key: string): key is EconomicImpactType {
  return key in ECONOMIC_IMPACT_TYPES
}
