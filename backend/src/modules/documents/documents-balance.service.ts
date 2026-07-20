import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getDocumentTypeDef } from './document-types'
import { computeTotalAmount } from './document-amounts'

// Permite recalcular el saldo con el client de una transacción (tx) en vez
// del singleton global — necesario para releer el saldo con datos frescos
// dentro de la misma transacción que aplica una Nota de Crédito (ver
// documents.service.ts#apply), y así cerrar la ventana de carrera entre
// leer el saldo y escribir la aplicación.
type BalanceClient = typeof prisma | Prisma.TransactionClient

export interface RelatedDocSummary {
  id: string
  documentNumber: string
  documentType: string
  documentStatus: string
  totalAmount: number
  adjustmentSign: string | null
  // true cuando este es el documento al que el documento consultado fue
  // aplicado (su propio linkedDocumentId), no uno de los que lo afectan a él.
  isOrigin: boolean
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
  async getBalance(id: string, client: BalanceClient = prisma): Promise<DocumentBalance> {
    const base = await client.accountingDocument.findUnique({
      where: { id },
      select: {
        id: true,
        documentType: true,
        documentStatus: true,
        netAmount: true,
        vatAmount: true,
        otherTaxesAmount: true,
        linkedDocumentId: true,
      },
    })
    if (!base) throw new AppError(404, 'Documento no encontrado', 'NOT_FOUND')

    const origin = base.linkedDocumentId
      ? await client.accountingDocument.findUnique({
          where: { id: base.linkedDocumentId },
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
      : null

    const typeDef = getDocumentTypeDef(base.documentType)
    const originalAmount = computeTotalAmount(base)

    const related = await client.accountingDocument.findMany({
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

    // Dirigido por typeDef.affectsLinkedDirection en vez de comparar
    // documentType literal por literal — Nota de Débito ahora requiere
    // APPLIED igual que Nota de Crédito y Ajuste (antes contaba con solo
    // no estar CANCELLED); Endoso queda afuera automáticamente porque
    // affectsLinkedBalance es false; Refacturación ('replaces') todavía no
    // tiene efecto numérico (Fase 2), solo aparece listada en relatedDocs.
    for (const doc of related) {
      const relatedTypeDef = getDocumentTypeDef(doc.documentType)
      if (!relatedTypeDef?.affectsLinkedBalance) continue

      const isApplied = doc.documentStatus === 'APPLIED'
      const amount = Math.abs(computeTotalAmount(doc))

      switch (relatedTypeDef.affectsLinkedDirection) {
        case 'credit':
          if (isApplied) appliedCredits += amount
          break
        case 'debit':
          if (isApplied) appliedDebits += amount
          break
        case 'adjusts':
          if (isApplied) appliedAdjustments += amount * (doc.adjustmentSign === 'NEGATIVE' ? -1 : 1)
          break
        case 'replaces':
          break
      }
    }

    const effectiveAmount = +(originalAmount - appliedCredits + appliedDebits + appliedAdjustments).toFixed(2)

    let paidAmount = 0
    if (typeDef?.hasPaymentStatus) {
      const paidInstallments = await client.documentInstallment.findMany({
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
      relatedDocs: [
        ...(origin
          ? [
              {
                id: origin.id,
                documentNumber: origin.documentNumber,
                documentType: origin.documentType,
                documentStatus: origin.documentStatus,
                totalAmount: computeTotalAmount(origin),
                adjustmentSign: origin.adjustmentSign,
                isOrigin: true,
              },
            ]
          : []),
        ...related.map((r) => ({
          id: r.id,
          documentNumber: r.documentNumber,
          documentType: r.documentType,
          documentStatus: r.documentStatus,
          totalAmount: computeTotalAmount(r),
          adjustmentSign: r.adjustmentSign,
          isOrigin: false,
        })),
      ],
    }
  },
}
