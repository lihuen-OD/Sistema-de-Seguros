import { Upload, FileText, X } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

interface MockFile {
  id: string
  name: string
  size: string
  type: string
}

interface FileDropzoneProps {
  label?: string
  accept?: string
  maxFiles?: number
  className?: string
}

export function FileDropzone({
  label = 'Adjuntar archivos',
  accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls',
  maxFiles = 10,
  className,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<MockFile[]>([])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const newFiles = Array.from(e.dataTransfer.files).slice(0, maxFiles).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: formatFileSize(f.size),
      type: f.type,
    }))
    setFiles((prev) => [...prev, ...newFiles].slice(0, maxFiles))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []).slice(0, maxFiles).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: formatFileSize(f.size),
      type: f.type,
    }))
    setFiles((prev) => [...prev, ...newFiles].slice(0, maxFiles))
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600 block mb-1.5">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'border-2 border-dashed rounded-lg px-6 py-8 text-center transition-colors',
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-200 hover:border-slate-300 bg-slate-50',
        )}
      >
        <Upload size={20} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-600">
          Arrastrá archivos o{' '}
          <label className="text-blue-600 hover:text-blue-700 cursor-pointer font-medium">
            hacé clic para seleccionar
            <input type="file" accept={accept} multiple onChange={handleChange} className="hidden" />
          </label>
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF, Excel, imágenes — máximo {maxFiles} archivos</p>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200">
              <div className="w-7 h-7 bg-blue-50 rounded flex items-center justify-center flex-shrink-0">
                <FileText size={14} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                <p className="text-xs text-slate-400">{f.size}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
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
