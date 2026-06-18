export type FileType = 'pdf' | 'image' | 'excel' | 'other'

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
