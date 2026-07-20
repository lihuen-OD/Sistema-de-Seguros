import { v2 as cloudinary } from 'cloudinary'
import { env } from './env'
import { AppError } from '../shared/errors/AppError'

export function isCloudinaryConfigured(): boolean {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  })
}

export interface CloudinaryResult {
  secure_url: string
  public_id: string
  format: string
  bytes: number
}

export function uploadToCloudinary(
  buffer: Buffer,
  folder = 'seguros',
  mimetype?: string,
): Promise<CloudinaryResult> {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'Almacenamiento de archivos no configurado', 'STORAGE_NOT_CONFIGURED')
  }

  const fullFolder = env.CLOUDINARY_ROOT_FOLDER ? `${env.CLOUDINARY_ROOT_FOLDER}/${folder}` : folder

  // Cloudinary clasifica los PDF subidos con resource_type "auto" como
  // "image" (para poder generar thumbnails), y desde 2024 bloquea por
  // seguridad la entrega directa de PDF/ZIP servidos como "image" salvo que
  // se habilite explícitamente en la cuenta ("Allow delivery of PDF and ZIP
  // files"). Subiéndolos como "raw" se entregan sin esa restricción, sin
  // depender de un toggle de cuenta que puede estar desactivado.
  const resourceType = mimetype === 'application/pdf' ? 'raw' : 'auto'

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: fullFolder, resource_type: resourceType },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload fallido'))
        resolve(result as CloudinaryResult)
      },
    )
    stream.end(buffer)
  })
}

export function deleteFromCloudinary(publicId: string): Promise<void> {
  if (!isCloudinaryConfigured()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export type CloudinaryResourceType = 'image' | 'raw' | 'video'

// El resource_type viaja como segmento de la URL pública
// (".../image/upload/..." o ".../raw/upload/..."), así que no hace falta
// guardarlo aparte en la base — se puede recuperar de ahí.
export function parseCloudinaryResourceType(fileUrl: string): CloudinaryResourceType {
  const match = fileUrl.match(/\/(image|raw|video)\/upload\//)
  return (match?.[1] as CloudinaryResourceType) ?? 'image'
}

// Link de descarga autenticado vía Admin API — a diferencia de la URL
// pública de entrega (res.cloudinary.com), este camino NO está sujeto a la
// restricción de seguridad de Cloudinary sobre PDF/ZIP servidos como
// "image" (verificado empíricamente: descarga archivos viejos que la URL
// pública rechaza con 401). Se genera al momento, nunca se persiste.
export function getSignedDownloadUrl(
  publicId: string,
  resourceType: CloudinaryResourceType,
  format: string,
): string {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'Almacenamiento de archivos no configurado', 'STORAGE_NOT_CONFIGURED')
  }
  return cloudinary.utils.private_download_url(publicId, format, { resource_type: resourceType, type: 'upload' })
}
