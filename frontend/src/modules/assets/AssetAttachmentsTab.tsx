import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon,
  X, AlertTriangle, CheckCircle2, Clock, Upload, Calendar, Paperclip, Download,
  Loader2,
} from 'lucide-react'
import type { AssetAttachment } from '../../shared/types'
import { assetsApi, assetKeys, assetQueries } from '../../shared/api/assets.api'
import { formatDate } from '../../shared/utils/format'
import { getExpirationStatus } from '../../shared/utils/expiration'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Add Attachment Modal ───────────────────────────────────────────────────────

interface AddModalProps {
  assetId: string
  onClose: () => void
  onSuccess: () => void
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

function AddAttachmentModal({ assetId, onClose, onSuccess }: AddModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [hasExpiration, setHasExpiration] = useState(false)
  const [expirationDate, setExpirationDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const applyFile = (file: File) => setSelectedFile(file)

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
    else if (detectFileType(selectedFile.name) === 'image') {
      e.file = 'Las imágenes van en "Fotografías", no en Adjuntos. Subila desde la galería de fotos del activo.'
    }
    if (hasExpiration && !expirationDate) e.expiration = 'Ingresá la fecha de vencimiento.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate() || !selectedFile) return
    setUploading(true)
    setUploadError(null)
    try {
      await assetsApi.addAttachment(assetId, {
        file: selectedFile,
        description: description.trim() || undefined,
        expirationDate: hasExpiration ? expirationDate : undefined,
      })
      onSuccess()
      onClose()
    } catch {
      setUploadError('No se pudo subir el archivo. Verificá tu conexión e intentá de nuevo.')
    } finally {
      setUploading(false)
    }
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
                <p className="text-xs text-slate-400 mt-1">PDF, Excel — máx. 20 MB. Para fotos, usá la galería "Fotografías".</p>
                <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <FileTypeIcon fileType={detectFileType(selectedFile.name)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button type="button" onClick={() => setSelectedFile(null)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}
            {errors.file && <p className="text-xs text-red-600 mt-1.5">{errors.file}</p>}
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
                  if (!next) setExpirationDate('')
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">Este documento tiene fecha de vencimiento</p>
                <p className="text-xs text-slate-500 mt-0.5">Registrá cuándo vence para hacer seguimiento</p>
              </div>
            </div>

            {hasExpiration && (
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
                <p className="text-xs text-slate-400 mt-2">
                  Va a aparecer en el centro de Notificaciones cuando esté por vencer.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50">
          {uploadError && (
            <div className="flex items-center gap-2 px-6 pt-3 text-xs text-red-600">
              <AlertTriangle size={13} />
              {uploadError}
            </div>
          )}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Subiendo...' : 'Guardar adjunto'}
          </button>
        </div>
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
  const queryClient = useQueryClient()
  const attachmentsKey = assetKeys.attachments(assetId)

  const { data: allAttachments = [] } = useQuery(assetQueries.attachments(assetId))

  // Las fotos (fileType === 'image') tienen su propia galería en la ficha del
  // activo — acá solo van documentos (PDF, Excel, etc.), para no duplicarlas
  // ni contarlas dos veces.
  const attachments = allAttachments.filter((a) => a.fileType !== 'image')

  const [showModal, setShowModal] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => assetsApi.deleteAttachment(assetId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attachmentsKey }),
  })

  const handleSuccess = () => queryClient.invalidateQueries({ queryKey: attachmentsKey })

  const handleRemove = (id: string) => deleteMutation.mutate(id)

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

                  {/* Vencimiento */}
                  <td className="px-4 py-3">
                    <ExpirationCell date={att.expirationDate} />
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
                        onClick={() => assetsApi.downloadAttachment(assetId, att.id, att.name)}
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
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
