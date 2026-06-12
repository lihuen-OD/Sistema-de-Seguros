import { mockAssetAttachments } from '../../data/mock-asset-attachments'
import type { AssetAttachment } from '../../shared/types'

export const assetAttachmentRepository = {
  findByAsset(assetId: string): AssetAttachment[] {
    return mockAssetAttachments.filter((a) => a.assetId === assetId)
  },
}
