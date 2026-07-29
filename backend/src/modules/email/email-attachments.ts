import type { EmailAttachment } from './email.types'

// Tope conservador muy por debajo del límite real del proveedor — evita que
// un documento con muchos adjuntos pesados haga fallar el envío completo.
const MAX_TOTAL_ATTACHMENTS_BYTES = 15 * 1024 * 1024 // 15 MB

// Sin esto, un Cloudinary lento/caído cuelga el fetch indefinidamente (Node no
// tiene timeout propio) y el request nunca responde — eso es lo que un 502 de
// gateway (Render) reporta como "el origen no contestó", no un error limpio.
const FETCH_TIMEOUT_MS = 10_000

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

async function downloadAttachment(file: AttachableFile): Promise<Buffer | null> {
  if (!file.fileUrl || file.fileUrl.startsWith('local://')) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(file.fileUrl, { signal: controller.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Baja el contenido real de cada adjunto (hoy siempre Cloudinary) para
// mandarlo como adjunto descargable del mail. Si un archivo no se puede
// adjuntar (no hay URL real, falla la descarga, se pasa del tope de tamaño,
// o tarda más de FETCH_TIMEOUT_MS) igual queda listado en el mail con un
// link a la plataforma — nunca se pierde la referencia silenciosamente.
// Las descargas van todas en paralelo (Promise.all) — en serie, un solo
// adjunto lento multiplica la latencia total por la cantidad de archivos.
export async function resolveEmailAttachments(files: AttachableFile[]): Promise<ResolvedEmailAttachments> {
  const buffers = await Promise.all(files.map(downloadAttachment))

  const attachments: EmailAttachment[] = []
  const summaries: AttachmentSummary[] = []
  let totalBytes = 0

  files.forEach((file, i) => {
    if (!file.fileUrl || file.fileUrl.startsWith('local://')) {
      summaries.push({ name: file.name, fileUrl: null, attached: false })
      return
    }

    const buffer = buffers[i]
    if (!buffer || totalBytes + buffer.byteLength > MAX_TOTAL_ATTACHMENTS_BYTES) {
      summaries.push({ name: file.name, fileUrl: file.fileUrl, attached: false })
      return
    }

    totalBytes += buffer.byteLength
    attachments.push({ filename: file.name, content: buffer })
    summaries.push({ name: file.name, fileUrl: file.fileUrl, attached: true })
  })

  return { attachments, summaries }
}
