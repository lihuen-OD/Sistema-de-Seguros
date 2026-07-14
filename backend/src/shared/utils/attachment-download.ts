import type { Response } from 'express'
import { AppError } from '../errors/AppError'
import { getSignedDownloadUrl, parseCloudinaryResourceType } from '../../config/cloudinary'

export interface DownloadableAttachment {
  fileUrl: string
  cloudinaryPublicId: string | null
  name: string
}

// Reutilizado por todos los módulos con adjuntos (Activos, Pólizas,
// Documentos, Siniestros) — genera el link de descarga firmado al momento,
// nunca a partir de la URL pública guardada en `fileUrl`.
function resolveAttachmentDownloadUrl(attachment: DownloadableAttachment): string {
  if (!attachment.cloudinaryPublicId) {
    throw new AppError(404, 'El archivo no está disponible para descargar', 'FILE_NOT_AVAILABLE')
  }

  const resourceType = parseCloudinaryResourceType(attachment.fileUrl)
  const ext = attachment.name.includes('.') ? attachment.name.split('.').pop()! : ''

  return getSignedDownloadUrl(attachment.cloudinaryPublicId, resourceType, ext)
}

// Baja el archivo real vía el link firmado (no sujeto a la restricción de
// PDF/ZIP de Cloudinary) y lo reenvía al navegador desde nuestro propio
// origen — evita problemas de CORS contra api.cloudinary.com y le da al
// navegador el nombre de archivo correcto para la descarga.
export async function sendAttachmentDownload(res: Response, attachment: DownloadableAttachment): Promise<void> {
  const url = resolveAttachmentDownloadUrl(attachment)

  const upstream = await fetch(url)
  if (!upstream.ok) {
    throw new AppError(502, 'No se pudo descargar el archivo', 'DOWNLOAD_FAILED')
  }

  const buffer = Buffer.from(await upstream.arrayBuffer())
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const safeName = attachment.name.replace(/"/g, '')

  res.setHeader('Content-Type', contentType)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  )
  res.send(buffer)
}
