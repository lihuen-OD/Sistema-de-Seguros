import { useState, useRef, useEffect } from 'react'
import { Camera, X, ZoomIn, ChevronLeft, ChevronRight, ImageOff, Loader2 } from 'lucide-react'

interface AssetPhotoGalleryProps {
  photos: string[]
  onAdd: (files: File[], previews: string[]) => void | Promise<void>
  onRemove: (index: number) => void | Promise<void>
  uploading?: boolean
  maxPhotos?: number
}

export function AssetPhotoGallery({
  photos,
  onAdd,
  onRemove,
  uploading = false,
  maxPhotos = 20,
}: AssetPhotoGalleryProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowLeft') setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length)
      if (e.key === 'ArrowRight') setLightboxIdx((lightboxIdx + 1) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, photos.length])

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIdx !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [lightboxIdx])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))
    const remaining = maxPhotos - photos.length
    const toProcess = files.slice(0, remaining)
    if (toProcess.length === 0) return

    // Convert to base64 for optimistic preview, pass both to parent
    Promise.all(
      toProcess.map(
        file =>
          new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onload = ev => resolve(ev.target?.result as string)
            reader.readAsDataURL(file)
          }),
      ),
    ).then(dataUrls => {
      if (dataUrls.length > 0) onAdd(toProcess, dataUrls)
    })

    e.target.value = ''
  }

  // ─── Empty state ─────────────────────────────────────────────────────────────
  if (photos.length === 0 && !uploading) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
          <ImageOff size={22} className="text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">Sin fotografías</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Agregá fotos del activo para documentar su estado físico
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Camera size={15} />
          Agregar fotografías
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    )
  }

  // ─── Uploading state ─────────────────────────────────────────────────────────
  if (uploading && photos.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <Loader2 size={24} className="text-brand-500 animate-spin" />
        <p className="text-sm text-slate-500">Subiendo fotografías…</p>
      </div>
    )
  }

  // ─── Grid with photos ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {photos.map((src, idx) => (
          <div
            key={src}
            className="relative group aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-sm"
          >
            <img
              src={src}
              alt={`Foto ${idx + 1}`}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all duration-150" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-150">
              <button
                type="button"
                title="Ver foto"
                onClick={() => setLightboxIdx(idx)}
                className="p-1.5 bg-white/90 rounded-lg text-slate-700 hover:bg-white shadow-sm transition-colors translate-y-1 group-hover:translate-y-0 duration-150"
              >
                <ZoomIn size={15} />
              </button>
              <button
                type="button"
                title="Eliminar foto"
                onClick={() => onRemove(idx)}
                disabled={uploading}
                className="p-1.5 bg-white/90 rounded-lg text-red-600 hover:bg-white shadow-sm transition-colors translate-y-1 group-hover:translate-y-0 duration-150 disabled:opacity-40"
              >
                <X size={15} />
              </button>
            </div>

            {/* Index badge */}
            <span className="absolute bottom-1.5 left-1.5 text-[10px] leading-none bg-black/50 text-white px-1.5 py-0.5 rounded-full pointer-events-none select-none">
              {idx + 1}
            </span>
          </div>
        ))}

        {/* Uploading tile */}
        {uploading && (
          <div className="aspect-[4/3] rounded-lg border-2 border-dashed border-brand-300 bg-brand-50/40 flex flex-col items-center justify-center gap-1.5">
            <Loader2 size={20} className="text-brand-500 animate-spin" />
            <span className="text-xs font-medium text-brand-500">Subiendo…</span>
          </div>
        )}

        {/* Add photo tile */}
        {!uploading && photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-video rounded-lg border-2 border-dashed border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition-colors flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-brand-500"
          >
            <Camera size={20} />
            <span className="text-xs font-medium">Agregar</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ─── Lightbox ─────────────────────────────────────────────────────────── */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>

          {/* Counter */}
          <span className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-sm tabular-nums select-none">
            {lightboxIdx + 1} / {photos.length}
          </span>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length)
              }}
              className="absolute left-4 p-2.5 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft size={26} />
            </button>
          )}

          {/* Main image */}
          <img
            src={photos[lightboxIdx]}
            alt={`Foto ${lightboxIdx + 1}`}
            className="max-h-[85vh] max-w-[80vw] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          {/* Next */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setLightboxIdx((lightboxIdx + 1) % photos.length)
              }}
              className="absolute right-4 p-2.5 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight size={26} />
            </button>
          )}

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div
              className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto pb-1"
              onClick={e => e.stopPropagation()}
            >
              {photos.map((thumb, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIdx(i)}
                  className={`flex-shrink-0 w-12 h-8 rounded overflow-hidden border-2 transition-all ${
                    i === lightboxIdx
                      ? 'border-white scale-110'
                      : 'border-white/20 opacity-60 hover:opacity-90'
                  }`}
                >
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
