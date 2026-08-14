import { AppError } from '../errors/AppError'
import { isAllowedMimetype, matchesDeclaredMimetype } from '../utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'

// Valida el mimetype (declarado y real) y sube el archivo a Cloudinary si
// está configurado — antes duplicado en assets/claims/documents/policies
// .service.ts. Cada caller sigue armando su propio registro en la tabla que
// corresponda (distinta por módulo), esta función solo cubre la parte 100%
// igual entre los 4.
export async function validateAndUploadAttachment(
  file: Express.Multer.File,
  folder: string,
): Promise<{ fileUrl: string; cloudinaryPublicId: string | null }> {
  if (!isAllowedMimetype(file.mimetype)) {
    throw new AppError(415, 'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel, Word, video', 'UNSUPPORTED_MEDIA_TYPE')
  }

  if (!matchesDeclaredMimetype(file.buffer, file.mimetype)) {
    throw new AppError(415, 'El contenido del archivo no coincide con su tipo declarado', 'FILE_TYPE_MISMATCH')
  }

  let fileUrl = `local://${file.originalname}`
  let cloudinaryPublicId: string | null = null

  if (isCloudinaryConfigured()) {
    const result = await uploadToCloudinary(file.buffer, folder, file.mimetype)
    fileUrl = result.secure_url
    cloudinaryPublicId = result.public_id
  }

  return { fileUrl, cloudinaryPublicId }
}

// Si `create` (el insert específico de cada módulo) falla después de haber
// subido a Cloudinary, borra el archivo recién subido (best-effort) antes de
// relanzar — mismo criterio en los 4 módulos, para no dejar archivos
// huérfanos en Cloudinary sin su fila correspondiente en la base.
export async function withAttachmentRollback<T>(
  cloudinaryPublicId: string | null,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create()
  } catch (err) {
    if (cloudinaryPublicId) await deleteFromCloudinary(cloudinaryPublicId).catch(() => undefined)
    throw err
  }
}
