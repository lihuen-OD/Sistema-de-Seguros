import { useState } from 'react'
import { Plus, X, Download, Paperclip } from 'lucide-react'
import type { PolicyAttachment } from '../../../shared/types'
import { formatDate } from '../../../shared/utils/format'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import {
  AddAttachmentModal,
  FileTypeIcon,
  ExpirationCell,
} from '../../../shared/components/file-upload/AttachmentListEditor'
import type { AssetAttachment } from '../../../shared/types'

// ── Main component ─────────────────────────────────────────────────────────────

interface PolicyAttachmentsSectionProps {
  policyId: string
}

export function PolicyAttachmentsSection({ policyId }: PolicyAttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<PolicyAttachment[]>([])
  const [showModal, setShowModal] = useState(false)

  const handleAdd = (partial: Omit<AssetAttachment, 'assetId'>) => {
    const saved: PolicyAttachment = {
      id: crypto.randomUUID(),
      policyId,
      name: partial.name,
      description: partial.description ?? '',
      fileType: partial.fileType,
      fileSize: partial.fileSize ?? '',
      expirationDate: partial.expirationDate,
      notifyEmail: partial.notifyEmail ?? '',
      uploadedBy: partial.uploadedBy ?? '',
      uploadedAt: new Date().toISOString(),
    }
    setAttachments((prev) => [...prev, saved])
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
          type="button"
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
          description="Adjuntá la póliza, certificados, habilitaciones u otros documentos."
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
                  <td className="px-4 py-3">
                    <ExpirationCell date={att.expirationDate} />
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
        <AddAttachmentModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}
