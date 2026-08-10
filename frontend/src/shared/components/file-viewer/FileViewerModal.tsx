import { useEffect, useState } from 'react'
import { X, FileWarning } from 'lucide-react'

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
// Content-Disposition — el tipo se decide por `blob.type` (el Content-Type
// real que reenvía el backend), no por la extensión del nombre.
export function FileViewerModal({ open, onClose, blob, name }: FileViewerModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

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

  const kind = blob?.type.startsWith('image/') ? 'image' : blob?.type === 'application/pdf' ? 'pdf' : 'other'

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
