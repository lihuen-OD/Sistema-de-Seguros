import { mockPolicyAttachments } from '../../data/mock-policy-attachments'
import type { PolicyAttachment } from '../../shared/types'

let attachments: PolicyAttachment[] = [...mockPolicyAttachments]

export const policyAttachmentRepository = {
  findByPolicy(policyId: string): PolicyAttachment[] {
    return attachments.filter((a) => a.policyId === policyId)
  },

  findById(id: string): PolicyAttachment | undefined {
    return attachments.find((a) => a.id === id)
  },

  create(data: Omit<PolicyAttachment, 'id' | 'uploadedAt'>): PolicyAttachment {
    const newAttachment: PolicyAttachment = {
      ...data,
      id: `patt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      uploadedAt: new Date().toISOString().slice(0, 10),
    }
    attachments = [...attachments, newAttachment]
    return newAttachment
  },

  update(
    id: string,
    changes: Partial<Omit<PolicyAttachment, 'id' | 'policyId' | 'uploadedAt'>>,
  ): PolicyAttachment | null {
    let updated: PolicyAttachment | null = null
    attachments = attachments.map((a) => {
      if (a.id !== id) return a
      updated = { ...a, ...changes }
      return updated
    })
    return updated
  },

  delete(id: string): boolean {
    const exists = attachments.some((a) => a.id === id)
    if (!exists) return false
    attachments = attachments.filter((a) => a.id !== id)
    return true
  },

  deleteByPolicy(policyId: string): number {
    const before = attachments.length
    attachments = attachments.filter((a) => a.policyId !== policyId)
    return before - attachments.length
  },
}
