import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getDocumentTypeDef } from './document-types'
import { computeTotalAmount } from './document-amounts'

export interface RelatedDocSummary {
  id: string
  documentNumber: string
  documentType: string
  documentStatus: string
  totalAmount: number
  adjustmentSign: string | null
}

export interface DocumentBalance {
  documentId: string
  documentType: string
  documentStatus: string
  originalAmount: number
  appliedCredits: number
  appliedDebits: number
  appliedAdjustments: number
  effectiveAmount: number
  paidAmount: number
  outstandingBalance: number
  creditBalance: number
  relatedDocs: RelatedDocSummary[]
}

// Fase 2 — cálculo de saldo neto de un documento considerando las Notas de
// Crédito/Débito y Asientos de Ajuste vinculados a él. Refacturación queda
// excluida del cálculo numérico por ahora (ver plan de refactor), solo
// aparece listada en relatedDocs.
export const documentsBalanceService = {
  async getBalance(id: string): Promise<DocumentBalance> {
    const base = await prisma.accountingDocument.findUnique({
      where: { id },
      select: {
        id: true,
        documentType: true,
        documentStatus: true,
        netAmount: true,
        vatAmount: true,
        otherTaxesAmount: true,
      },
    })
    if (!base) throw new AppError(404, 'Documento no encontrado', 'NOT_FOUND')

    const typeDef = getDocumentTypeDef(base.documentType)
    const originalAmount = computeTotalAmount(base)

    const related = await prisma.accountingDocument.findMany({
      where: { linkedDocumentId: id },
      select: {
        id: true,
        documentNumber: true,
        documentType: true,
        documentStatus: true,
        netAmount: true,
        vatAmount: true,
        otherTaxesAmount: true,
        adjustmentSign: true,
      },
    })

    let appliedCredits = 0
    let appliedDebits = 0
    let appliedAdjustments = 0

    for (const doc of related) {
      const amount = Math.abs(computeTotalAmount(doc))
      if (doc.documentType === 'CREDIT_NOTE' && doc.documentStatus === 'APPLIED') {
        appliedCredits += amount
      } else if (doc.documentType === 'DEBIT_NOTE' && doc.documentStatus !== 'CANCELLED') {
        appliedDebits += amount
      } else if (doc.documentType === 'ADJUSTMENT_ENTRY' && doc.documentStatus === 'APPLIED') {
        appliedAdjustments += amount * (doc.adjustmentSign === 'NEGATIVE' ? -1 : 1)
      }
      // REBILLING: sin efecto numérico en Fase 2, solo aparece en relatedDocs.
    }

    const effectiveAmount = +(originalAmount - appliedCredits + appliedDebits + appliedAdjustments).toFixed(2)

    let paidAmount = 0
    if (typeDef?.hasPaymentStatus) {
      const paidInstallments = await prisma.documentInstallment.findMany({
        where: { accountingDocumentId: id, paymentStatus: 'PAID' },
        select: { amount: true },
      })
      paidAmount = paidInstallments.reduce((sum, i) => sum + i.amount, 0)
    }

    const outstandingBalance = typeDef?.hasPaymentStatus
      ? Math.max(0, +(effectiveAmount - paidAmount).toFixed(2))
      : 0
    const creditBalance = typeDef?.hasPaymentStatus
      ? Math.max(0, +(paidAmount - effectiveAmount).toFixed(2))
      : 0

    return {
      documentId: base.id,
      documentType: base.documentType,
      documentStatus: base.documentStatus,
      originalAmount,
      appliedCredits: +appliedCredits.toFixed(2),
      appliedDebits: +appliedDebits.toFixed(2),
      appliedAdjustments: +appliedAdjustments.toFixed(2),
      effectiveAmount,
      paidAmount: +paidAmount.toFixed(2),
      outstandingBalance,
      creditBalance,
      relatedDocs: related.map((r) => ({
        id: r.id,
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        documentStatus: r.documentStatus,
        totalAmount: computeTotalAmount(r),
        adjustmentSign: r.adjustmentSign,
      })),
    }
  },
}
