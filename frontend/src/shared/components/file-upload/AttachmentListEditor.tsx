import { useState, useRef } from 'react'
import {
  Plus, FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon,
  X, AlertTriangle, CheckCircle2, Clock, Upload, Calendar, Paperclip, Download,
} from 'lucide-react'
import type { AssetAttachment } from '../../types'
import { formatDate } from '../../utils/format'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExpirationStatus(date: string | null): 'vencido' | 'proximo_vencer' | 'vigente' | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(date + 'T00:00:00')
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'vencido'
  if (diffDays <= 30) return 'proximo_vencer'
  return 'vigente'
}

export function detectFileType(filename: string): AssetAttachment['fileType'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel'
  return 'other'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

export function FileTypeIcon({ fileType }: { fileType: AssetAttachment['fileType'] }) {
  const base = 'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0'
  const variants: Record<AssetAttachment['fileType'], { bg: string; icon: React.ReactNode }> = {
    pdf:   { bg: 'bg-red-50',    icon: <FileText size={15} className="text-red-600" /> },
    image: { bg: 'bg-blue-50',   icon: <ImageIcon size={15} className="text-blue-600" /> },
    excel: { bg: 'bg-green-50',  icon: <FileSpreadsheet size={15} className="text-green-600" /> },
    other: { bg: 'bg-slate-100', icon: <FileIcon size={15} className="text-slate-500" /> },
  }
  const v = variants[fileType]
  return <div className={`${base} ${v.bg}`}>{v.icon}</div>
}

export function ExpirationCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-slate-400">Sin vencimiento</span>

  const status = getExpirationStatus(date)
  const config = {
    vencido:        { label: 'Vencido',      style: 'bg-red-50 text-red-700 border-red-200',             Icon: AlertTriangle },
    proximo_vencer: { label: 'Próx. vencer', style: 'bg-amber-50 text-amber-700 border-amber-200',       Icon: Clock },
    vigente:        { label: 'Vigente',      style: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  }[status!]

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border w-fit ${config.style}`}>
        <config.Icon size={10} />
        {config.label}
      </span>
      <span className="text-xs text-slate-500">{formatDate(date)}</span>
    </div>
  )
}

// ── Add modal ─────────────────────────────────────────────────────────────────

interface AddModalProps {
  onClose: () => void
  onAdd: (attachment: Omit<AssetAttachment, 'assetId'>) => void
}

export function AddAttachmentModal({ onClose, onAdd }: AddModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hasExpiration, setHasExpiration] = useState(false)
  const [expirationDate, setExpirationDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const applyFile = (file: File) => {
    setSelectedFile(file)
    if (!name) setName(file.name.replace(/\.[^/.]+$/, ''))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) applyFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) applyFile(file)
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!selectedFile) e.file = 'Seleccioná un archivo.'
    if (!name.trim()) e.name = 'Ingresá un nombre para el documento.'
    if (hasExpiration && !expirationDate) e.expiration = 'Ingresá la fecha de vencimiento.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate() || !selectedFile) return
    const ext = selectedFile.name.split('.').pop() ?? 'file'
    onAdd({
      id: `att-${Date.now()}`,
      name: `${name.trim()}.${ext}`,
      description: description.trim(),
      fileType: detectFileType(selectedFile.name),
      fileSize: formatFileSize(selectedFile.size),
      expirationDate: hasExpiration ? expirationDate : null,
      uploadedAt: new Date().toISOString().split('T')[0],
      uploadedBy: 'Usuario actual',
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Paperclip size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Adjuntar documento</h3>
              <p className="text-xs text-slate-500">Subí un archivo y configurá sus datos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* File drop zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Archivo <span className="text-red-500">*</span>
            </label>
            {!selectedFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/30'
                }`}
              >
                <Upload size={20} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-600">
                  Arrastrá el archivo o{' '}
                  <span className="text-blue-600 font-medium">hacé clic para seleccionar</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">PDF, Excel, imágenes — máx. 20 MB</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <FileTypeIcon fileType={detectFileType(selectedFile.name)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedFile(null); setName('') }}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {errors.file && <p className="text-xs text-red-600 mt-1.5">{errors.file}</p>}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nombre del documento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Cédula verde Toyota Hilux"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
            />
            {errors.name && <p className="text-xs text-red-600 mt-1.5">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Descripción{' '}
              <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cédula de identificación vigente"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
            />
          </div>

          {/* Expiration date */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="flex-shrink-0 mt-0.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={hasExpiration}
                  onClick={() => {
                    setHasExpiration((v) => !v)
                    if (hasExpiration) setExpirationDate('')
                  }}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    hasExpiration
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 bg-white hover:border-blue-400'
                  }`}
                >
                  {hasExpiration && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">Este documento tiene fecha de vencimiento</p>
                <p className="text-xs text-slate-500 mt-0.5">Permite recibir alertas cuando el documento esté por vencer</p>
              </div>
            </label>

            {hasExpiration && (
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  <Calendar size={11} className="inline mr-1 align-[-1px]" />
                  Fecha de vencimiento <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                />
                {errors.expiration && (
                  <p className="text-xs text-red-600 mt-1.5">{errors.expiration}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Upload size={14} />
            Guardar adjunto
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AttachmentListEditor ───────────────────────────────────────────────────────

interface AttachmentListEditorProps {
  attachments: AssetAttachment[]
  onChange: (attachments: AssetAttachment[]) => void
  assetId?: string
}

export function AttachmentListEditor({
  attachments,
  onChange,
  assetId = '',
}: AttachmentListEditorProps) {
  const [showModal, setShowModal] = useState(false)

  const handleAdd = (partial: Omit<AssetAttachment, 'assetId'>) => {
    onChange([...attachments, { ...partial, assetId }])
  }

  const handleRemove = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-xs font-medium text-slate-600">
          Adjuntos{' '}
          {attachments.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[11px] font-medium">
              {attachments.length}
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus size={12} />
          Adjuntar archivo
        </button>
      </div>

      {attachments.length === 0 ? (
        <div
          onClick={() => setShowModal(true)}
          className="border-2 border-dashed border-slate-200 rounded-xl py-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition-colors"
        >
          <Paperclip size={18} className="mx-auto text-slate-300 mb-1.5" />
          <p className="text-sm text-slate-500">
            Adjuntá documentación al activo
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Podés cargar PDF, Excel o imágenes con fecha de vencimiento opcional
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 p-2.5 bg-white border border-slate-200 rounded-xl group"
            >
              <FileTypeIcon fileType={att.fileType} />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{att.name}</p>
                <p className="text-xs text-slate-400">
                  {att.description
                    ? <>{att.description} · {att.fileSize}</>
                    : att.fileSize
                  }
                </p>
              </div>

              {att.expirationDate && (
                <div className="flex-shrink-0">
                  <ExpirationBadge date={att.expirationDate} />
                </div>
              )}

              <button
                type="button"
                onClick={() => handleRemove(att.id)}
                title="Eliminar"
                className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <AddAttachmentModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}

// ── Compact expiration badge (for list items) ─────────────────────────────────

function ExpirationBadge({ date }: { date: string }) {
  const status = getExpirationStatus(date)
  if (!status) return null

  const config = {
    vencido:        { label: 'Vencido',      style: 'bg-red-50 text-red-700 border-red-200',             Icon: AlertTriangle },
    proximo_vencer: { label: 'Próx. vencer', style: 'bg-amber-50 text-amber-700 border-amber-200',       Icon: Clock },
    vigente:        { label: formatDate(date), style: 'bg-slate-50 text-slate-600 border-slate-200',     Icon: Calendar },
  }[status]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.style}`}>
      <config.Icon size={10} />
      {config.label}
    </span>
  )
}

// Re-export for convenience
export { Download }
