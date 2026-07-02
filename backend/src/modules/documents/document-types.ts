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
    documentStatusOptions: ['ISSUED', 'CANCELLED', 'OBSERVED'],
    paymentStatusOptions: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'],
    isInternal: false,
  },

  ENDORSEMENT: {
    key: 'ENDORSEMENT',
    label: 'Endoso',
    requiresLinkedDocument: false,
    linkedDocumentLabel: 'Documento asociado',
    hasInstallments: false,
    hasPaymentStatus: false,
    affectsLinkedBalance: false,
    relationType: 'ENDORSES',
    requiresAdjustmentReason: false,
    requiresAdjustmentSign: false,
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

export function getDocumentTypeDef(key: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES[key]
}

export function isValidDocumentType(key: string): boolean {
  return key in DOCUMENT_TYPES
}

export function isValidAdjustmentReason(key: string): boolean {
  return key in ADJUSTMENT_REASONS
}
