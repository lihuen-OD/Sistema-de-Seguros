import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatDate } from '../../../shared/utils/format'
import { downloadAsPdf } from '../../../shared/utils/downloadAsPdf'
import { documentQueries } from '../../../shared/api/documents.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { PAYMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '../../../shared/constants'

const EMISSION_DATE = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function DocumentFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fichaRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const { data: doc } = useQuery(documentQueries.detail(id!))
  const { data: documentTypesData } = useQuery(documentQueries.types())
  const { data: allPolicies = [] } = useQuery(policyQueries.list())
  const { data: rawInstallments = [] } = useQuery(documentQueries.installments(id!))
  const { data: allocations = [] } = useQuery(documentQueries.allocations(id!))

  if (!doc) {
    return (
      <PageContent>
        <EmptyState title="Documento no encontrado" description="El documento solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const linkedPolicies = allPolicies.filter(p => doc.policyIds?.includes(p.id))
  const typeDef = documentTypesData?.types.find((t) => t.key === doc.documentType)
  const hasOwnAmounts = typeDef?.hasOwnAmounts ?? true

  async function handleDownload() {
    if (!fichaRef.current) return
    setDownloading(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadAsPdf(fichaRef.current, `ficha-documento-${doc!.documentNumber}-${date}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const paymentLabel = PAYMENT_STATUS_LABELS[doc.paymentStatus] ?? doc.paymentStatus
  const documentTypeLabel = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType

  return (
    <PageContent>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(`/insurance/documents/${doc.id}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver al documento
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
          {downloading ? 'Generando…' : 'Descargar PDF'}
        </button>
      </div>

      <div ref={fichaRef} className="max-w-[860px] mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 text-white px-8 py-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">
              Sistema de Administración Patrimonial, Seguros y Matafuegos
            </p>
            <p className="text-lg font-bold tracking-wide">FICHA DE DOCUMENTO CONTABLE</p>
          </div>
          <div className="text-right flex-shrink-0 ml-8">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Emitido</p>
            <p className="text-sm font-semibold mt-0.5">{EMISSION_DATE}</p>
          </div>
        </div>

        {/* Identity bar */}
        <div className="px-8 py-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/40">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">
                {doc.documentNumber}
              </span>
              <StatusPill status={doc.paymentStatus} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{documentTypeLabel}</h1>
            {doc.insuranceCompany && (
              <p className="text-sm text-slate-500 mt-1">{doc.insuranceCompany}</p>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            {hasOwnAmounts ? (
              <>
                <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Total</p>
                <p className="text-xl font-bold text-blue-700 tabular-nums">
                  {formatCurrencyFull(doc.totalAmount, doc.currency)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{paymentLabel}</p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Impacto Económico</p>
                <p className="text-lg font-bold text-blue-700">
                  {documentTypesData?.economicImpactTypes.find((t) => t.key === doc.economicImpactType)?.label ?? doc.economicImpactType ?? '—'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">

          {/* Left */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Datos del Documento</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="N° de documento" value={doc.documentNumber} mono />
                <FichaRow label="Tipo de documento" value={documentTypeLabel} />
                <FichaRow label="Fecha de emisión" value={formatDate(doc.issueDate)} />
                <FichaRow label="Estado de pago" value={paymentLabel} />
                {doc.paymentMethod && <FichaRow label="Método de pago" value={doc.paymentMethod} />}
                {doc.insuranceCompany && <FichaRow label="Compañía" value={doc.insuranceCompany} />}
              </div>
            </div>

            {linkedPolicies.length > 0 && (
              <div>
                <SectionHeading>
                  Pólizas Vinculadas
                  <span className="ml-1.5 text-xs font-normal text-slate-400">({linkedPolicies.length})</span>
                </SectionHeading>
                <div className="space-y-2">
                  {linkedPolicies.map(p => (
                    <div key={p.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1">
                      <FichaRow label="N° Póliza" value={p.policyNumber} mono />
                      <FichaRow label="Compañía" value={p.insuranceCompany} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right */}
          <div className="p-8 space-y-6">
            {hasOwnAmounts ? (
              <div>
                <SectionHeading>Importes</SectionHeading>
                <div className="space-y-2.5">
                  <FichaRow label="Moneda" value={doc.currency} />
                  {doc.exchangeRate > 1 && (
                    <FichaRow label="Tipo de cambio" value={`$ ${doc.exchangeRate.toLocaleString('es-AR')}`} />
                  )}
                  {doc.netAmount > 0 && (
                    <FichaRow label="Neto" value={formatCurrencyFull(doc.netAmount, doc.currency)} />
                  )}
                  {doc.vatAmount > 0 && (
                    <FichaRow label="IVA" value={formatCurrencyFull(doc.vatAmount, doc.currency)} />
                  )}
                  {doc.otherTaxesAmount > 0 && (
                    <FichaRow label="Otros impuestos" value={formatCurrencyFull(doc.otherTaxesAmount, doc.currency)} />
                  )}
                  <FichaRow label="Total" value={formatCurrencyFull(doc.totalAmount, doc.currency)} highlight />
                </div>
              </div>
            ) : (
              <div>
                <SectionHeading>Datos del Endoso</SectionHeading>
                <div className="space-y-2.5">
                  <FichaRow
                    label="Tipo de endoso"
                    value={documentTypesData?.endorsementTypes.find((t) => t.key === doc.endorsementType)?.label ?? doc.endorsementType ?? '—'}
                  />
                  <FichaRow
                    label="Fecha de vigencia"
                    value={doc.endorsementEffectiveDate ? formatDate(doc.endorsementEffectiveDate) : '—'}
                  />
                  <FichaRow
                    label="Impacto económico"
                    value={documentTypesData?.economicImpactTypes.find((t) => t.key === doc.economicImpactType)?.label ?? doc.economicImpactType ?? '—'}
                    highlight
                  />
                  {doc.description && <FichaRow label="Descripción / motivo" value={doc.description} />}
                </div>
              </div>
            )}

            {rawInstallments.length > 0 && (
              <div>
                <SectionHeading>
                  Cuotas
                  <span className="ml-1.5 text-xs font-normal text-slate-400">({rawInstallments.length})</span>
                </SectionHeading>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-3">Cuota</th>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-3">Vencimiento</th>
                      <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-3">Monto</th>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawInstallments.map((inst, idx) => (
                      <tr key={inst.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3 text-slate-600">{idx + 1}</td>
                        <td className="py-1.5 pr-3 text-slate-600">{formatDate(inst.dueDate)}</td>
                        <td className="py-1.5 pr-3 text-right font-medium text-slate-800">{formatCurrencyFull(inst.amount, doc.currency)}</td>
                        <td className="py-1.5 text-xs text-slate-600">{PAYMENT_STATUS_LABELS[inst.paymentStatus] ?? inst.paymentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-8 border-t border-slate-200 bg-slate-50/50 grid grid-cols-3 gap-8">
          <SignatureLine label="Preparado por" />
          <SignatureLine label="Revisado por" />
          <SignatureLine label="Autorizado por" />
        </div>
      </div>

      <div className="h-8" />
    </PageContent>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-2">
      {children}
    </p>
  )
}

function FichaRow({ label, value, highlight = false, mono = false }: {
  label: string; value: string; highlight?: boolean; mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 min-w-0">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium text-right min-w-0 break-words ${mono ? 'font-mono' : ''} ${highlight ? 'text-blue-700 font-semibold' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  )
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="border-b-2 border-slate-300 h-10 mb-2" />
      <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">Firma y aclaración</p>
    </div>
  )
}
