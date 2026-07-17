import multer from 'multer'
import { isAllowedMimetype } from '../shared/utils/files'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMimetype(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Tipo de archivo no permitido. Usar PDF, imagen (JPG/PNG/WebP), Excel/CSV, Word (DOC/DOCX) o video (MP4/MOV/AVI/WebM)'))
    }
  },
})
