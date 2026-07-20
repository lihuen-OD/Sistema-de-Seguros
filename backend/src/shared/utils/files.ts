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

function isZipSignature(buf: Buffer): boolean {
  // XLSX/DOCX son archivos ZIP — "PK\x03\x04" (local file header) es la firma
  // estándar; \x05\x06/\x07\x08 cubren el caso (raro) de un ZIP vacío o partido.
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)
}

function isOle2Signature(buf: Buffer): boolean {
  // Formato binario legacy de Office (.xls, .doc) — OLE2 Compound File Binary Format
  return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
}

// Firma real (magic bytes) por mimetype declarado — cierra el gap de que
// Content-Type es un dato que el cliente controla libremente y puede mentir
// (ej. subir un .html/.svg renombrado a .jpg para intentar que después se
// sirva con un Content-Type de imagen). CSV y los contenedores de video
// (MP4/MOV/AVI/WebM) no tienen una firma corta y confiable para todas sus
// variantes válidas, así que para esos se sigue confiando solo en el
// mimetype declarado — limitación documentada, no una regresión.
const SIGNATURE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  'application/pdf': (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/jpg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (buf) => buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('latin1')),
  'image/webp': (buf) =>
    buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': isZipSignature,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': isZipSignature,
  'application/vnd.ms-excel': isOle2Signature,
  'application/msword': isOle2Signature,
}

// multer's fileFilter solo ve mimetype/originalname (el buffer todavía no
// está completo en ese punto) — esta validación corre después, una vez que
// el archivo ya está en memoria (`file.buffer`), justo antes de subirlo.
export function matchesDeclaredMimetype(buffer: Buffer, mimetype: string): boolean {
  const check = SIGNATURE_CHECKS[mimetype]
  return check ? check(buffer) : true
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
