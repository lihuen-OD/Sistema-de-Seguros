import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Info, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../../../../shared/components/modals/Modal'
import { FormTextarea } from '../../../../shared/components/forms/FormSection'
import { documentsApi, documentKeys, documentQueries } from '../../../../shared/api/documents.api'
import { DOCUMENT_TYPE_LABELS } from '../../../../shared/constants'
import { formatCurrencyFull, formatDate } from '../../../../shared/utils/format'
import { EmailChipField } from './EmailChipField'
import type { AccountingDocument } from '../../../../shared/types'

interface Props {
  documentId?: string
  disabled?: boolean
}

export function SendAccountingDocumentEmailAction({ documentId, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const { data: document } = useQuery({ ...documentQueries.detail(documentId ?? ''), enabled: !!documentId })
  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery({
    ...documentQueries.attachments(documentId ?? ''),
    enabled: !!documentId,
  })

  function handleOpen() {
    if (!documentId || disabled) return
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || !documentId || attachmentsLoading}
        onClick={handleOpen}
        className="flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={!documentId ? 'Guardá primero el documento para poder enviarlo' : 'Enviar por mail'}
      >
        <Mail size={15} />
        Enviar por mail
      </button>

      {open && document && (
        <SendAccountingDocumentEmailModal
          key={`${document.id}-${open}`}
          document={document}
          attachmentNames={attachments.map((attachment) => attachment.name)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function SendAccountingDocumentEmailModal({
  document,
  attachmentNames,
  onClose,
}: {
  document: AccountingDocument
  attachmentNames: string[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [to, setTo] = useState<string[]>([])
  const [cc, setCc] = useState<string[]>([])
  const [bcc, setBcc] = useState<string[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const policyNumbers = [...new Set((document.allocations ?? []).map((allocation) => allocation.policy?.policyNumber).filter((value): value is string => !!value))]
  const [subject, setSubject] = useState(() => {
    const label = DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType
    const context = policyNumbers.join(', ') || document.insuranceCompany
    return `${label} ${document.documentNumber}${context ? ` - ${context}` : ''}`
  })
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'skipped'>('idle')

  async function handleSend() {
    if (to.length === 0 || status === 'sending') return
    setStatus('sending')
    try {
      const result = await documentsApi.sendEmail(document.id, {
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: documentKeys.emailLogs(document.id) })
      if (result.status === 'SKIPPED') {
        setStatus('skipped')
      } else {
        setStatus('sent')
        toast.success('El documento fue enviado por mail correctamente.')
      }
    } catch {
      setStatus('idle')
    }
  }

  const isBusy = status === 'sending'

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={Mail}
      iconClassName="bg-brand-50 text-brand-600"
      title="Enviar por mail"
      description={`${DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType} ${document.documentNumber}`}
      hideCloseButton={isBusy}
      closeOnBackdropClick={!isBusy}
      closeOnEscape={!isBusy}
    >
      {status === 'sent' ? (
        <div className="py-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <p className="text-sm font-semibold text-slate-800">Documento enviado correctamente</p>
          <button type="button" onClick={onClose} className="mt-4 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
            Cerrar
          </button>
        </div>
      ) : status === 'skipped' ? (
        <div className="py-6 text-center">
          <Info size={40} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-semibold text-slate-800">Envío deshabilitado en este entorno</p>
          <p className="text-xs text-slate-500 mt-1">El intento quedó registrado, pero no se envió ningún mail.</p>
          <button type="button" onClick={onClose} className="mt-4 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">
            Cerrar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600">Para <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2.5">
                {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-xs text-slate-400 hover:text-brand-600">Cc</button>}
                {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="text-xs text-slate-400 hover:text-brand-600">Cco</button>}
              </div>
            </div>
            <EmailChipField emails={to} onChange={setTo} placeholder="destinatario@ejemplo.com" autoFocus />
          </div>
          {showCc && <div><label className="text-xs font-medium text-slate-600 block mb-1">Cc</label><EmailChipField emails={cc} onChange={setCc} placeholder="cc@ejemplo.com" /></div>}
          {showBcc && <div><label className="text-xs font-medium text-slate-600 block mb-1">Cco</label><EmailChipField emails={bcc} onChange={setBcc} placeholder="cco@ejemplo.com" /></div>}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Asunto</label>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Mensaje adicional</label>
            <FormTextarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={3} placeholder="Comentario opcional para el destinatario…" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"><span className="text-slate-500">Fecha</span><span className="font-medium text-slate-700">{formatDate(document.issueDate)}</span></div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"><span className="text-slate-500">Importe</span><span className="font-medium text-slate-700 break-words">{formatCurrencyFull(document.totalAmount, document.currency)}</span></div>
            {document.insuranceCompany && <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"><span className="text-slate-500">Empresa</span><span className="font-medium text-slate-700 break-words sm:text-right">{document.insuranceCompany}</span></div>}
            {policyNumbers.length > 0 && <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"><span className="text-slate-500">Pólizas</span><span className="font-medium text-slate-700 break-words sm:text-right">{policyNumbers.join(', ')}</span></div>}
            {attachmentNames.length > 0 && <div className="border-t border-slate-200 pt-2 flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"><span className="text-slate-500">Adjuntos</span><span className="font-medium text-slate-700 break-all sm:text-right">{attachmentNames.join(', ')}</span></div>}
          </div>
          {attachmentNames.length === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>Este documento no tiene archivos adjuntos. Se enviará solo la información del documento.</span>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center">
            <button type="button" onClick={handleSend} disabled={to.length === 0 || isBusy} className="flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed sm:flex-1">
              <Mail size={14} /> {isBusy ? 'Enviando…' : 'Enviar'}
            </button>
            <button type="button" onClick={onClose} disabled={isBusy} className="w-full px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg disabled:opacity-40 sm:w-auto">Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
