import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { upload } from '../../middleware/upload.middleware'
import { uploadsController } from './uploads.controller'

export const uploadsRouter = Router()

uploadsRouter.use(authMiddleware)

// POST /api/v1/uploads?folder=policies — sube un archivo a Cloudinary
uploadsRouter.post('/', upload.single('file'), uploadsController.uploadFile)

// DELETE /api/v1/uploads — elimina un archivo de Cloudinary por publicId
uploadsRouter.delete('/', requireRole('ADMIN', 'CONTADOR'), uploadsController.deleteFile)
