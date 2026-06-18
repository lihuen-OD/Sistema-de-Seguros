import { mockAssetAttachments } from '../../data/mock-asset-attachments'
import type { AssetAttachment } from '../../shared/types'

let attachments: AssetAttachment[] = [...mockAssetAttachments]

export const assetAttachmentRepository = {
  findByAsset(assetId: string): AssetAttachment[] {
    return attachments.filter((a) => a.assetId === assetId)
  },

  findById(id: string): AssetAttachment | undefined {
    return attachments.find((a) => a.id === id)
  },

  create(data: Omit<AssetAttachment, 'id' | 'uploadedAt'>): AssetAttachment {
    const newAttachment: AssetAttachment = {
      ...data,
      id: `att-${Date.now()}`,
      uploadedAt: new Date().toISOString().slice(0, 10),
    }
    attachments = [...attachments, newAttachment]
    return newAttachment
  },

  update(id: string, changes: Partial<Omit<AssetAttachment, 'id' | 'assetId' | 'uploadedAt'>>): AssetAttachment | null {
    let updated: AssetAttachment | null = null
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

  deleteByAsset(assetId: string): number {
    const before = attachments.length
    attachments = attachments.filter((a) => a.assetId !== assetId)
    return before - attachments.length
  },
}
