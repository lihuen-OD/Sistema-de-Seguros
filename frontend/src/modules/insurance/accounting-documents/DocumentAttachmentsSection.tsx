import { useState, useRef } from 'react'
import { Plus, X, Download, Paperclip, Upload } from 'lucide-react'
import type { AccountingDocumentAttachment } from '../../../shared/types'
import { accountingDocumentAttachmentRepository } from '../../../services/repositories/accounting-document-attachment.repository'
import { formatDate } from '../../../shared/utils/format'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import {
  FileTypeIcon,
  detectFileType,
  formatFileSize,
} from '../../../shared/components/file-upload/AttachmentListEditor'

// ── Add modal ─────────────────────────────────────────────────────────────────

function AddDocumentAttachmentModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (att: Omit<AccountingDocumentAttachment, 'id' | 'documentId' | 'uploadedAt'>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const applyFile = (file: File) => {
    setSelectedFile(file)
    if (!name) setName(file.name.replace(/\.[^/.]+$/, ''))
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!selectedFile) e.file = 'Seleccioná un archivo.'
    if (!name.trim()) e.name = 'Ingresá un nombre para el documento.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate() || !selectedFile) return
    const ext = selectedFile.name.split('.').pop() ?? 'file'
    onAdd({
      name: `${name.trim()}.${ext}`,
      description: description.trim(),
      fileType: detectFileType(selectedFile.name),
      fileSize: formatFileSize(selectedFile.size),
      uploadedBy: 'Usuario actual',
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Paperclip size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Adjuntar archivo</h3>
              <p className="text-xs text-slate-500">Factura PDF, endoso u otro documento</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Archivo <span className="text-red-500">*</span>
            </label>
            {!selectedFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) applyFile(f) }}
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
                <p className="text-xs text-slate-400 mt-1">PDF, imágenes, Excel — máx. 20 MB</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f) }}
                />
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Factura N° 0001-00012345"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
            />
            {errors.name && <p className="text-xs text-red-600 mt-1.5">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Descripción <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Factura original enviada por mail"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
            />
          </div>
        </div>

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

interface DocumentAttachmentsSectionProps {
  documentId: string
}

export function DocumentAttachmentsSection({ documentId }: DocumentAttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<AccountingDocumentAttachment[]>(() =>
    accountingDocumentAttachmentRepository.findByDocument(documentId),
  )
  const [showModal, setShowModal] = useState(false)

  const handleAdd = (partial: Omit<AccountingDocumentAttachment, 'id' | 'documentId' | 'uploadedAt'>) => {
    const saved = accountingDocumentAttachmentRepository.create({ ...partial, documentId })
    setAttachments((prev) => [...prev, saved])
  }

  const handleRemove = (id: string) => {
    accountingDocumentAttachmentRepository.delete(id)
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">Archivos adjuntos</span>
          {attachments.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {attachments.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={14} />
          Adjuntar archivo
        </button>
      </div>

      {attachments.length === 0 ? (
        <EmptyState
          title="Sin archivos adjuntos"
          description="Adjuntá la factura PDF, el endoso u otros documentos relacionados."
          icon={Paperclip}
          action={
            <button
              type="button"
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
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-[55%]">Archivo</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Subido</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attachments.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/60 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileTypeIcon fileType={att.fileType} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate max-w-[260px]">{att.name}</p>
                        {att.description && (
                          <p className="text-xs text-slate-400 truncate max-w-[260px]">
                            {att.description} <span className="text-slate-300">· {att.fileSize}</span>
                          </p>
                        )}
                        {!att.description && (
                          <p className="text-xs text-slate-400">{att.fileSize}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-700">{formatDate(att.uploadedAt)}</p>
                    <p className="text-xs text-slate-400">{att.uploadedBy}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        type="button"
                        title="Descargar"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        type="button"
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

      {showModal && (
        <AddDocumentAttachmentModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}
