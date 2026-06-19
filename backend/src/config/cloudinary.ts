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
): Promise<CloudinaryResult> {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'Almacenamiento de archivos no configurado', 'STORAGE_NOT_CONFIGURED')
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
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
