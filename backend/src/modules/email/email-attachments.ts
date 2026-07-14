import type { EmailAttachment } from './email.types'

// Tope conservador muy por debajo del límite real del proveedor — evita que
// un documento con muchos adjuntos pesados haga fallar el envío completo.
const MAX_TOTAL_ATTACHMENTS_BYTES = 15 * 1024 * 1024 // 15 MB

export interface AttachableFile {
  name: string
  fileUrl: string
}

export interface AttachmentSummary {
  name: string
  // null cuando no hay una URL real para linkear (ej. placeholder `local://`
  // usado cuando Cloudinary no está configurado — no existe archivo real).
  fileUrl: string | null
  attached: boolean
}

export interface ResolvedEmailAttachments {
  attachments: EmailAttachment[]
  summaries: AttachmentSummary[]
}

// Baja el contenido real de cada adjunto (hoy siempre Cloudinary) para
// mandarlo como adjunto descargable del mail. Si un archivo no se puede
// adjuntar (no hay URL real, falla la descarga, o se pasa del tope de
// tamaño) igual queda listado en el mail con un link a la plataforma —
// nunca se pierde la referencia silenciosamente.
export async function resolveEmailAttachments(files: AttachableFile[]): Promise<ResolvedEmailAttachments> {
  const attachments: EmailAttachment[] = []
  const summaries: AttachmentSummary[] = []
  let totalBytes = 0

  for (const file of files) {
    if (!file.fileUrl || file.fileUrl.startsWith('local://')) {
      summaries.push({ name: file.name, fileUrl: null, attached: false })
      continue
    }

    try {
      const res = await fetch(file.fileUrl)
      if (!res.ok) {
        summaries.push({ name: file.name, fileUrl: file.fileUrl, attached: false })
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      if (totalBytes + buffer.byteLength > MAX_TOTAL_ATTACHMENTS_BYTES) {
        summaries.push({ name: file.name, fileUrl: file.fileUrl, attached: false })
        continue
      }

      totalBytes += buffer.byteLength
      attachments.push({ filename: file.name, content: buffer })
      summaries.push({ name: file.name, fileUrl: file.fileUrl, attached: true })
    } catch {
      summaries.push({ name: file.name, fileUrl: file.fileUrl, attached: false })
    }
  }

  return { attachments, summaries }
}
