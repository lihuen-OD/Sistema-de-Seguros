import type { DocumentForFinancial } from '../api/documents.api'

// ── Cuotas propias de un ajuste ya volcado en la factura ─────────────────────
// Solo la factura tiene cuotas propias: una NC/ND/Ajuste/Endoso aplicado
// ajusta las cuotas no pagas de su factura vinculada (backend:
// redistributeAdjustmentAcrossInstallments, que deja un registro por cuota
// tocada). Documentos anteriores a esa regla pueden tener ADEMÁS cuotas
// propias (ej. ND01): contarlas duplicaría el ajuste. Regla, sin tocar datos:
// - si lo ya volcado en la factura cubre el total del documento, sus cuotas
//   propias se EXCLUYEN de los cálculos (el importe ya está en la factura);
// - si no se puede confirmar (no volcó nada o solo una parte), se cuentan y
//   se avisa — no se decide por el usuario.

export const ADJUSTING_DOCUMENT_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT_ENTRY', 'ENDORSEMENT'] as const

/** Tolerancia relativa para comparar lo volcado contra el total (redondeos de reparto y de TC). */
const COVERAGE_TOLERANCE = 0.005

export interface AdjustmentInstallmentIssue {
  documentId: string
  documentNumber: string
  documentType: string
  /** Σ de las cuotas propias del documento (moneda nativa). */
  ownInstallmentsAmount: number
  currency: string
  /** Lo que ya volcó en las cuotas de la factura, en la moneda del documento (null = desconocido). */
  appliedAmount: number | null
  /** true = cuotas propias excluidas por duplicar el ajuste ya reflejado en la factura. */
  excluded: boolean
}

export function adjustmentInstallmentIssue(doc: DocumentForFinancial): AdjustmentInstallmentIssue | null {
  if (!(ADJUSTING_DOCUMENT_TYPES as readonly string[]).includes(doc.documentType)) return null
  if (doc.documentStatus !== 'APPLIED' || doc.installments.length === 0) return null
  const applied = doc.appliedAdjustment
  const appliedAmount = applied ? Math.abs(doc.currency === 'USD' ? applied.usd : applied.ars) : null
  const docTotal = Math.abs((doc.currency === 'USD' ? doc.totalAmountUsd : doc.totalAmountArs) ?? doc.totalAmount)
  const excluded = !!applied && applied.count > 0 && appliedAmount !== null && docTotal > 0
    && appliedAmount >= docTotal * (1 - COVERAGE_TOLERANCE)
  return {
    documentId: doc.id,
    documentNumber: doc.documentNumber,
    documentType: doc.documentType,
    ownInstallmentsAmount: doc.installments.reduce((s, i) => s + i.amount, 0),
    currency: doc.currency,
    appliedAmount,
    excluded,
  }
}

/** Documentos cuyas cuotas propias se excluyen (duplican un ajuste ya volcado en la factura). */
export function duplicatedAdjustmentDocumentIds(documents: DocumentForFinancial[]): Set<string> {
  const ids = new Set<string>()
  for (const doc of documents) if (adjustmentInstallmentIssue(doc)?.excluded) ids.add(doc.id)
  return ids
}
