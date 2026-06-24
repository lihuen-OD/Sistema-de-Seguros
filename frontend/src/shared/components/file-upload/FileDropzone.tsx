import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react'
import { useState, useRef } from 'react'
import clsx from 'clsx'

interface PendingFile {
  id: string
  file: File
  name: string
  size: string
  picked?: boolean
  uploading?: boolean
  done?: boolean
  error?: string
}

interface FileDropzoneProps {
  label?: string
  accept?: string
  maxFiles?: number
  className?: string
  /** Upload inmediato al backend (para edición, donde ya existe el ID). */
  onFilesSelected?: (files: File[]) => Promise<void>
  /** Solo captura los File[] en estado del padre (para creación, donde el ID aún no existe). */
  onFilesPicked?: (files: File[]) => void
}

export function FileDropzone({
  label = 'Adjuntar archivos',
  accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls',
  maxFiles = 10,
  className,
  onFilesSelected,
  onFilesPicked,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [pending, setPending] = useState<PendingFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const buildPending = (files: File[]): PendingFile[] =>
    files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      size: formatFileSize(f.size),
    }))

  const handleFiles = async (files: File[]) => {
    const next = buildPending(files.slice(0, maxFiles))

    if (onFilesPicked) {
      // Modo captura: notifica al padre con los File[] sin subir aún
      const withPicked = next.map((p) => ({ ...p, picked: true }))
      setPending((prev) => [...prev, ...withPicked].slice(0, maxFiles))
      onFilesPicked(next.map((p) => p.file))
      return
    }

    if (!onFilesSelected) {
      // Modo mock: solo muestra localmente
      setPending((prev) => [...prev, ...next].slice(0, maxFiles))
      return
    }

    // Modo real: marca como cargando y llama al callback
    setPending((prev) => [...prev, ...next.map((p) => ({ ...p, uploading: true }))].slice(0, maxFiles))
    const ids = next.map((p) => p.id)
    try {
      await onFilesSelected(next.map((p) => p.file))
      setPending((prev) =>
        prev.map((p) => ids.includes(p.id) ? { ...p, uploading: false, done: true } : p),
      )
      // Limpia los completados después de 1.5 s
      setTimeout(() => {
        setPending((prev) => prev.filter((p) => !ids.includes(p.id)))
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al subir'
      setPending((prev) =>
        prev.map((p) => ids.includes(p.id) ? { ...p, uploading: false, error: message } : p),
      )
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []))
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeFile = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600 block mb-1.5">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'border-2 border-dashed rounded-lg px-6 py-8 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-200 hover:border-slate-300 bg-slate-50',
        )}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={20} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-600">
          Arrastrá archivos o{' '}
          <span className="text-blue-600 hover:text-blue-700 font-medium">hacé clic para seleccionar</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Máximo {maxFiles} archivos
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {pending.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pending.map((f) => (
            <li key={f.id} className={clsx(
              'flex items-center gap-2.5 p-2.5 rounded-lg border',
              f.picked ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200',
            )}>
              <div className={clsx(
                'w-7 h-7 rounded flex items-center justify-center flex-shrink-0',
                f.done ? 'bg-emerald-50' : f.error ? 'bg-red-50' : f.picked ? 'bg-amber-100' : 'bg-blue-50',
              )}>
                {f.uploading ? (
                  <Loader2 size={14} className="text-blue-500 animate-spin" />
                ) : f.done ? (
                  <CheckCircle2 size={14} className="text-emerald-600" />
                ) : (
                  <FileText size={14} className={f.error ? 'text-red-500' : f.picked ? 'text-amber-600' : 'text-blue-600'} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                <p className={clsx('text-xs', f.error ? 'text-red-500' : f.picked ? 'text-amber-600 font-medium' : 'text-slate-400')}>
                  {f.error ?? (f.uploading ? 'Subiendo…' : f.done ? 'Subido' : f.picked ? `Pendiente de subir · ${f.size}` : f.size)}
                </p>
              </div>
              {!f.uploading && !f.done && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(f.id) }}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
