import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Clock3, Mail, MinusCircle } from 'lucide-react'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { EmptyState } from '../../../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../../../shared/components/empty-states/ErrorState'
import { LoadingState } from '../../../../shared/components/empty-states/LoadingState'
import { Modal } from '../../../../shared/components/modals/Modal'
import {
  documentQueries,
  type DocumentEmailLog,
  type DocumentEmailStatus,
} from '../../../../shared/api/documents.api'

const STATUS: Record<
  DocumentEmailStatus,
  { label: string; classes: string; Icon: React.ElementType }
> = {
  SENT: {
    label: 'Enviado',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: CheckCircle2,
  },
  FAILED: { label: 'Fallido', classes: 'bg-red-50 text-red-700 border-red-200', Icon: AlertCircle },
  SKIPPED: {
    label: 'Omitido',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: MinusCircle,
  },
  PENDING: {
    label: 'Pendiente',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
    Icon: Clock3,
  },
  CANCELLED: {
    label: 'Cancelado',
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
    Icon: MinusCircle,
  },
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: DocumentEmailStatus }) {
  const config = STATUS[status] ?? STATUS.PENDING
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${config.classes}`}
    >
      <config.Icon size={12} />
      {config.label}
    </span>
  )
}

function Addresses({ values }: { values: string[] }) {
  return <span className="break-all">{values.length > 0 ? values.join(', ') : '—'}</span>
}

function EmailDetail({ log }: { log: DocumentEmailLog }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Para', <Addresses values={log.to} />],
    ['CC', <Addresses values={log.cc} />],
    ['CCO', <Addresses values={log.bcc} />],
    ['Asunto', <span className="break-words">{log.subject}</span>],
    [
      'Mensaje',
      <span className="whitespace-pre-wrap break-words">
        {log.message ?? 'No quedó registrado para este envío.'}
      </span>,
    ],
    ['Fecha y hora', formatDateTime(log.sentAt ?? log.failedAt ?? log.createdAt)],
    ['Enviado por', log.sentBy?.email ?? 'Sistema'],
    [
      'Adjuntos',
      log.attachments.length > 0 ? (
        <Addresses values={log.attachments} />
      ) : (
        'Sin adjuntos registrados'
      ),
    ],
  ]
  return (
    <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1 text-sm">
      <div>
        <StatusBadge status={log.status} />
      </div>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 border-b border-slate-100 pb-3 sm:grid-cols-[130px_minmax(0,1fr)]"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {label}
          </span>
          <div className="min-w-0 text-slate-700">{value}</div>
        </div>
      ))}
      {log.errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">Error del envío</p>
          <p className="mt-1 break-words text-sm text-red-700">{log.errorMessage}</p>
        </div>
      )}
    </div>
  )
}

export function DocumentEmailHistory({ documentId }: { documentId: string }) {
  const [selected, setSelected] = useState<DocumentEmailLog | null>(null)
  const {
    data: logs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery(documentQueries.emailLogs(documentId))

  return (
    <>
      <SectionCard
        title="Historial de mails"
        subtitle={`${logs.length} intento${logs.length !== 1 ? 's' : ''} registrado${logs.length !== 1 ? 's' : ''}`}
        noPadding
        className="mt-5"
      >
        {isLoading ? (
          <LoadingState rows={3} className="px-5" />
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar el historial"
            description="Intentá nuevamente."
            action={
              <button
                type="button"
                onClick={() => refetch()}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Reintentar
              </button>
            }
          />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Sin mails enviados"
            description="Todavía no se enviaron mails para este documento."
          />
        ) : (
          <>
            <div className="hidden md:block overflow-hidden">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-[16%] px-5 py-3 font-medium">Fecha</th>
                    <th className="w-[13%] px-3 py-3 font-medium">Estado</th>
                    <th className="w-[24%] px-3 py-3 font-medium">Destinatarios</th>
                    <th className="w-[23%] px-3 py-3 font-medium">Asunto</th>
                    <th className="w-[16%] px-3 py-3 font-medium">Enviado por</th>
                    <th className="w-[8%] px-3 py-3 text-right font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {formatDateTime(log.sentAt ?? log.failedAt ?? log.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <Addresses values={log.to} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 break-words">
                        {log.subject}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 break-all">
                        {log.sentBy?.email ?? 'Sistema'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(log)}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">
              {logs.map((log) => (
                <article key={log.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <StatusBadge status={log.status} />
                    <span className="text-right text-[11px] text-slate-400">
                      {formatDateTime(log.sentAt ?? log.failedAt ?? log.createdAt)}
                    </span>
                  </div>
                  <div>
                    <p className="break-words text-sm font-semibold text-slate-800">
                      {log.subject}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-500">{log.to.join(', ')}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span className="min-w-0 break-all">
                      {log.sentBy?.email ?? 'Sistema'} · {log.attachments.length} adj.
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(log)}
                      className="shrink-0 font-semibold text-brand-600"
                    >
                      Ver detalle
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </SectionCard>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        icon={Mail}
        iconClassName="bg-brand-50 text-brand-600"
        title="Detalle del mail"
        description={selected?.subject}
      >
        {selected && <EmailDetail log={selected} />}
      </Modal>
    </>
  )
}
