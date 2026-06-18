import { mockDocumentAttachments } from '../../data/mock-document-attachments'
import type { AccountingDocumentAttachment } from '../../shared/types'

let attachments: AccountingDocumentAttachment[] = [...mockDocumentAttachments]

export const accountingDocumentAttachmentRepository = {
  findByDocument(documentId: string): AccountingDocumentAttachment[] {
    return attachments.filter((a) => a.documentId === documentId)
  },

  findById(id: string): AccountingDocumentAttachment | undefined {
    return attachments.find((a) => a.id === id)
  },

  create(data: Omit<AccountingDocumentAttachment, 'id' | 'uploadedAt'>): AccountingDocumentAttachment {
    const newAttachment: AccountingDocumentAttachment = {
      ...data,
      id: `datt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      uploadedAt: new Date().toISOString().slice(0, 10),
    }
    attachments = [...attachments, newAttachment]
    return newAttachment
  },

  delete(id: string): boolean {
    const exists = attachments.some((a) => a.id === id)
    if (!exists) return false
    attachments = attachments.filter((a) => a.id !== id)
    return true
  },

  deleteByDocument(documentId: string): number {
    const before = attachments.length
    attachments = attachments.filter((a) => a.documentId !== documentId)
    return before - attachments.length
  },
}
