import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { detectFileType, formatFileSize, isAllowedMimetype } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'

const VALID_FOLDERS = ['seguros', 'policies', 'assets', 'documents', 'extinguishers', 'claims']

export const uploadsController = {
  uploadFile: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError(400, 'No se recibió ningún archivo', 'FILE_MISSING')
    }

    if (!isAllowedMimetype(req.file.mimetype)) {
      throw new AppError(
        400,
        'Tipo de archivo no permitido. Usar PDF, imagen (JPG/PNG/WebP) o Excel/CSV',
        'INVALID_FILE_TYPE',
      )
    }

    if (!isCloudinaryConfigured()) {
      throw new AppError(503, 'Almacenamiento de archivos no configurado', 'STORAGE_NOT_CONFIGURED')
    }

    const rawFolder = req.query.folder as string | undefined
    const folder = rawFolder && VALID_FOLDERS.includes(rawFolder) ? rawFolder : 'seguros'

    const result = await uploadToCloudinary(req.file.buffer, folder)

    res.status(201).json({
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        fileType: detectFileType(req.file.mimetype),
        fileSize: formatFileSize(req.file.size),
        originalName: req.file.originalname,
      },
    })
  }),

  deleteFile: asyncHandler(async (req: Request, res: Response) => {
    const { publicId } = req.body as { publicId?: string }
    if (!publicId || typeof publicId !== 'string') {
      throw new AppError(400, 'publicId requerido', 'INVALID_BODY')
    }

    await deleteFromCloudinary(publicId)
    res.json({ data: { message: 'Archivo eliminado correctamente' } })
  }),
}
