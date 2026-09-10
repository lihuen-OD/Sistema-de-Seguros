import { useEffect, useState } from 'react'
import { X, FileWarning } from 'lucide-react'
import { detectFileType } from '../file-upload/AttachmentListEditor'

export interface FileViewerModalProps {
  open: boolean
  onClose: () => void
  blob: Blob | null
  name: string
}

// Visor en la misma app — recibe el archivo ya descargado como Blob (ver
// FileViewDownloadButtons), nunca la URL pública de Cloudinary: esa URL está
// sujeta a la restricción de seguridad de Cloudinary sobre PDF/ZIP y termina
// en una descarga forzada en vez de mostrarse. Un Blob renderizado vía
// `URL.createObjectURL` no depende de esa URL ni de ningún header
// Content-Disposition. El tipo se decide primero por `blob.type` (el
// Content-Type real que reenvía el backend) y, si no alcanza, por la
// extensión del nombre — ver el detalle junto a `kind` más abajo.
export function FileViewerModal({ open, onClose, blob, name }: FileViewerModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  // El Content-Type que reenvía el backend debería alcanzar, pero los PDF se
  // suben a Cloudinary como resource_type "raw" (ver config/cloudinary.ts) —
  // en la práctica esa entrega a veces vuelve con un Content-Type genérico
  // (ej. application/octet-stream) en vez de application/pdf. La extensión
  // del nombre real del archivo es el fallback, nunca la única fuente.
  const extType = detectFileType(name)
  const isImage = !!blob?.type.startsWith('image/') || extType === 'image'
  const isPdf = !!blob?.type.startsWith('application/pdf') || extType === 'pdf'

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null)
      return
    }
    // Un <iframe> que navega a un blob: URL decide si renderiza inline o
    // dispara una descarga según el `type` REAL del Blob — no según `kind`
    // (que acá abajo solo elige qué JSX pintar). Si el Content-Type que
    // llegó no dice application/pdf pero la extensión confirma que lo es,
    // hay que re-tipar el Blob antes de crear la URL: sin esto, el
    // navegador no sabe mostrarlo inline, el modal queda en blanco y
    // dispara una descarga automática por su cuenta — nunca a través de
    // triggerBlobDownload, que solo llama el botón de descargar.
    const typedBlob = isPdf && !blob.type.startsWith('application/pdf')
      ? new Blob([blob], { type: 'application/pdf' })
      : blob
    const url = URL.createObjectURL(typedBlob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob, isPdf])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const kind = isImage ? 'image' : isPdf ? 'pdf' : 'other'

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-white/90 truncate">{name}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex-shrink-0 p-2 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 px-4 sm:px-10 pb-6 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {!objectUrl ? (
          <div className="text-center text-white/70 max-w-sm">
            <FileWarning size={28} className="mx-auto mb-3 text-white/40" />
            <p className="text-sm">No se pudo cargar el archivo.</p>
          </div>
        ) : kind === 'image' ? (
          <img src={objectUrl} alt={name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        ) : kind === 'pdf' ? (
          <iframe src={objectUrl} title={name} className="w-full h-full bg-white rounded-lg shadow-2xl" />
        ) : (
          <div className="text-center text-white/70 max-w-sm">
            <FileWarning size={28} className="mx-auto mb-3 text-white/40" />
            <p className="text-sm">No se puede previsualizar este tipo de archivo. Usá el botón de descargar.</p>
          </div>
        )}
      </div>
    </div>
  )
}
