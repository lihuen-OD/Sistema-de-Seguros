import multer from 'multer'

// Archivos se guardan en memoria (Buffer).
// Phase 10: se sube a Cloudinary antes de persistir en DB.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
    files: 1,
  },
})
