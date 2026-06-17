import { useState, useRef } from 'react'
import {
  Plus, FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon,
  X, AlertTriangle, CheckCircle2, Clock, Upload, Calendar, Paperclip, Download,
  Mail, Bell, Send,
} from 'lucide-react'
import type { AssetAttachment } from '../../shared/types'
import { assetAttachmentRepository } from '../../services/repositories/asset-attachment.repository'
import { formatDate } from '../../shared/utils/format'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'

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

function detectFileType(filename: string): AssetAttachment['fileType'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FileTypeIcon({ fileType }: { fileType: AssetAttachment['fileType'] }) {
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

function ExpirationCell({ date }: { date: string | null }) {
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

function NotificationBadge({
  email,
  expirationStatus,
}: {
  email: string
  expirationStatus: ReturnType<typeof getExpirationStatus>
}) {
  const isAlert = expirationStatus === 'vencido' || expirationStatus === 'proximo_vencer'

  return (
    <div className={`mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-lg w-fit text-[11px] font-medium border ${
      isAlert
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-slate-50 border-slate-200 text-slate-500'
    }`}>
      {isAlert ? <Send size={10} /> : <Mail size={10} />}
      <span className="truncate max-w-[160px]">{email}</span>
      {isAlert && (
        <span className="flex-shrink-0 font-semibold text-amber-700">· Notif. enviada</span>
      )}
    </div>
  )
}

// ── Add Attachment Modal ───────────────────────────────────────────────────────

interface AddModalProps {
  assetId: string
  onClose: () => void
  onAdd: (attachment: AssetAttachment) => void
}

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white hover:border-blue-400'
      }`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

function AddAttachmentModal({ assetId, onClose, onAdd }: AddModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hasExpiration, setHasExpiration] = useState(false)
  const [expirationDate, setExpirationDate] = useState('')
  const [hasNotification, setHasNotification] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState('')
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
    if (hasNotification && !notifyEmail.trim()) e.email = 'Ingresá el email para la notificación.'
    if (hasNotification && notifyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail.trim())) {
      e.email = 'El formato del email no es válido.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate() || !selectedFile) return
    const ext = selectedFile.name.split('.').pop() ?? 'file'
    const attachment: AssetAttachment = {
      id: `att-${Date.now()}`,
      assetId,
      name: `${name.trim()}.${ext}`,
      description: description.trim(),
      fileType: detectFileType(selectedFile.name),
      fileSize: formatFileSize(selectedFile.size),
      expirationDate: hasExpiration ? expirationDate : null,
      notifyEmail: hasNotification && hasExpiration ? notifyEmail.trim() : undefined,
      uploadedAt: new Date().toISOString().split('T')[0],
      uploadedBy: 'Usuario actual',
    }
    onAdd(attachment)
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
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Archivo */}
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
                  isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/30'
                }`}
              >
                <Upload size={20} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-600">
                  Arrastrá el archivo o{' '}
                  <span className="text-blue-600 font-medium">hacé clic para seleccionar</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">PDF, Excel, imágenes — máx. 20 MB</p>
                <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <FileTypeIcon fileType={detectFileType(selectedFile.name)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button type="button" onClick={() => { setSelectedFile(null); setName('') }} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}
            {errors.file && <p className="text-xs text-red-600 mt-1.5">{errors.file}</p>}
          </div>

          {/* Nombre */}
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

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Descripción <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Habilitación municipal vigente"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
            />
          </div>

          {/* Vencimiento + Notificación — bloque unificado */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">

            {/* Fila vencimiento */}
            <div className="flex items-start gap-3 p-4 bg-slate-50/50">
              <Checkbox
                checked={hasExpiration}
                onToggle={() => {
                  const next = !hasExpiration
                  setHasExpiration(next)
                  if (!next) { setExpirationDate(''); setHasNotification(false); setNotifyEmail('') }
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">Este documento tiene fecha de vencimiento</p>
                <p className="text-xs text-slate-500 mt-0.5">Registrá cuándo vence para hacer seguimiento</p>
              </div>
            </div>

            {hasExpiration && (
              <>
                {/* Campo fecha */}
                <div className="px-4 pb-4 bg-slate-50/50">
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
                  {errors.expiration && <p className="text-xs text-red-600 mt-1.5">{errors.expiration}</p>}
                </div>

                {/* Divisor */}
                <div className="border-t border-slate-200" />

                {/* Fila notificación email */}
                <div className="flex items-start gap-3 p-4">
                  <Checkbox
                    checked={hasNotification}
                    onToggle={() => {
                      setHasNotification((v) => !v)
                      if (hasNotification) setNotifyEmail('')
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">Notificar por email al vencer</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                        Simulado
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Se enviará un aviso al email indicado 30 días antes del vencimiento y el día que venza
                    </p>
                  </div>
                </div>

                {/* Campo email */}
                {hasNotification && (
                  <div className="px-4 pb-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      <Mail size={11} className="inline mr-1 align-[-1px]" />
                      Email destinatario <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="Ej: proveedor@empresa.com"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
                    />
                    {errors.email && <p className="text-xs text-red-600 mt-1.5">{errors.email}</p>}
                    {notifyEmail && !errors.email && (
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <Bell size={10} />
                        Se notificará a <span className="font-medium text-slate-600 ml-0.5">{notifyEmail}</span> cuando el documento esté por vencer
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            <Upload size={14} />
            Guardar adjunto
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AssetAttachmentsTabProps {
  assetId: string
}

export function AssetAttachmentsTab({ assetId }: AssetAttachmentsTabProps) {
  const [attachments, setAttachments] = useState<AssetAttachment[]>(() =>
    assetAttachmentRepository.findByAsset(assetId),
  )
  const [showModal, setShowModal] = useState(false)

  const handleAdd = (attachment: AssetAttachment) => {
    setAttachments((prev) => [...prev, attachment])
  }

  const handleRemove = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">Documentos adjuntos</span>
          {attachments.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {attachments.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={14} />
          Adjuntar archivo
        </button>
      </div>

      {/* List / Empty */}
      {attachments.length === 0 ? (
        <EmptyState
          title="Sin adjuntos"
          description="Adjuntá documentos como cédula verde, VTV, habilitaciones o certificados."
          icon={Paperclip}
          action={
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={14} />
              Adjuntar primer archivo
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-[45%]">
                  Archivo
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Vencimiento
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Subido
                </th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attachments.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/60 transition-colors group">
                  {/* Archivo */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileTypeIcon fileType={att.fileType} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate max-w-[220px]">{att.name}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[220px]">
                          {att.description
                            ? <>{att.description} <span className="text-slate-300">· {att.fileSize}</span></>
                            : att.fileSize
                          }
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Vencimiento + notificación */}
                  <td className="px-4 py-3">
                    <ExpirationCell date={att.expirationDate} />
                    {att.notifyEmail && (
                      <NotificationBadge
                        email={att.notifyEmail}
                        expirationStatus={att.expirationDate ? getExpirationStatus(att.expirationDate) : null}
                      />
                    )}
                  </td>

                  {/* Subido */}
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-700">{formatDate(att.uploadedAt)}</p>
                    <p className="text-xs text-slate-400">{att.uploadedBy}</p>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        title="Descargar"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        title="Eliminar"
                        onClick={() => handleRemove(att.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AddAttachmentModal
          assetId={assetId}
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}
