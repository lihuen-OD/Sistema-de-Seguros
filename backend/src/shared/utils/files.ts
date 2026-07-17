export type FileType = 'pdf' | 'image' | 'excel' | 'word' | 'video' | 'other'

const MIME_TO_TYPE: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'excel',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  'video/webm': 'video',
}

const ALLOWED_MIMETYPES = new Set(Object.keys(MIME_TO_TYPE))

export function detectFileType(mimetype: string): FileType {
  return MIME_TO_TYPE[mimetype] ?? 'other'
}

export function isAllowedMimetype(mimetype: string): boolean {
  return ALLOWED_MIMETYPES.has(mimetype)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// file.originalname es 100% controlado por quien sube el archivo y se
// guarda/devuelve tal cual (JSON + Content-Disposition) — sin límite de
// longitud ni limpieza. Quita caracteres de control y trunca conservando la
// extensión, para no persistir nombres absurdamente largos o con bytes raros.
export function sanitizeFileName(name: string, maxLength = 200): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\x00-\x1f\x7f]/g, '').trim() || 'archivo'
  if (cleaned.length <= maxLength) return cleaned
  const dotIndex = cleaned.lastIndexOf('.')
  const hasShortExt = dotIndex > 0 && cleaned.length - dotIndex <= 12
  const ext = hasShortExt ? cleaned.slice(dotIndex) : ''
  const base = hasShortExt ? cleaned.slice(0, dotIndex) : cleaned
  return base.slice(0, maxLength - ext.length) + ext
}
