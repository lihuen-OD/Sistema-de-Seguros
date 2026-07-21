import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatDate } from '../../../shared/utils/format'
import { downloadAsPdf } from '../../../shared/utils/downloadAsPdf'
import { policyQueries } from '../../../shared/api/policies.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { POLICY_STATUS_LABELS, PAYMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '../../../shared/constants'

const EMISSION_DATE = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function PolicyFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fichaRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const { data: policy } = useQuery(policyQueries.detail(id!))
  const { data: producers = [] } = useQuery(producerQueries.list())
  const { data: companies = [] } = useQuery(companyQueries.list())
  const { data: costCenters = [] } = useQuery(costCenterQueries.list())
  const { data: allDocuments = [] } = useQuery(documentQueries.list())

  if (!policy) {
    return (
      <PageContent>
        <EmptyState title="Póliza no encontrada" description="La póliza solicitada no existe o fue eliminada." />
      </PageContent>
    )
  }

  const producer = producers.find(p => p.id === policy.producerId)
  const linkedAssets = policy.selectedAssets ?? []
  const company = policy.companyId ? companies.find(c => c.id === policy.companyId) : null
  const costCenter = policy.costCenterId ? costCenters.find(cc => cc.id === policy.costCenterId) : null
  const documents = allDocuments.filter(d => d.policyIds?.includes(policy.id))

  async function handleDownload() {
    if (!fichaRef.current) return
    setDownloading(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadAsPdf(fichaRef.current, `ficha-poliza-${policy!.policyNumber}-${date}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const statusLabel = POLICY_STATUS_LABELS[policy.status] ?? policy.status

  return (
    <PageContent>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(`/insurance/policies/${policy.id}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver a la póliza
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
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
            <p className="text-lg font-bold tracking-wide">FICHA DE PÓLIZA DE SEGURO</p>
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
                {policy.policyNumber}
              </span>
              <StatusPill status={policy.status} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{policy.insuranceCompany}</h1>
            <p className="text-sm text-slate-500 mt-1">{policy.insuranceType} · {policy.coverageType}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Suma asegurada</p>
            <p className="text-xl font-bold text-brand-700 tabular-nums">
              {formatCurrencyFull(policy.insuredAmountUsd, 'USD')}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {formatCurrencyFull(policy.insuredAmountArs, 'ARS')}
            </p>
          </div>
        </div>

        {/* Body — 2 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">

          {/* Left */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Datos de la Póliza</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="N° de Póliza" value={policy.policyNumber} mono />
                <FichaRow label="Compañía aseguradora" value={policy.insuranceCompany} />
                <FichaRow label="Tipo de seguro" value={policy.insuranceType} />
                <FichaRow label="Tipo de cobertura" value={policy.coverageType} />
                {producer && <FichaRow label="Productor asesor" value={producer.name} />}
                <FichaRow label="Estado" value={statusLabel} />
              </div>
            </div>

            <div>
              <SectionHeading>Vigencia</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Fecha de inicio" value={formatDate(policy.startDate)} />
                <FichaRow label="Fecha de vencimiento" value={formatDate(policy.endDate)} />
              </div>
              {policy.description && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Descripción</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{policy.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>
                {linkedAssets.length > 0
                  ? `Activo${linkedAssets.length !== 1 ? 's' : ''} Asegurado${linkedAssets.length !== 1 ? 's' : ''}`
                  : 'Imputación Contable'}
              </SectionHeading>
              {linkedAssets.length > 0 ? (
                <div className="space-y-2">
                  {linkedAssets.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-1.5">
                      <FichaRow label="Código interno" value={a.internalCode} mono />
                      <FichaRow label="Nombre" value={a.name} />
                      <FichaRow label="Tipo" value={a.assetType} />
                      {a.fixedAssetCode && (
                        <FichaRow
                          label="Bien de uso"
                          value={a.fixedAssetName ? `${a.fixedAssetCode} — ${a.fixedAssetName}` : a.fixedAssetCode}
                        />
                      )}
                      {a.costCenterCode && (
                        <FichaRow
                          label="Centro de costo"
                          value={a.costCenterName ? `${a.costCenterCode} — ${a.costCenterName}` : a.costCenterCode}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {company && <FichaRow label="Empresa" value={company.name} />}
                  {costCenter && <FichaRow label="Centro de costo" value={`${costCenter.code} — ${costCenter.name}`} />}
                </div>
              )}
            </div>

            <div>
              <SectionHeading>Importes</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Suma asegurada (ARS)" value={formatCurrencyFull(policy.insuredAmountArs, 'ARS')} highlight />
                <FichaRow label="Tipo de cambio ARS/USD" value={`$ ${policy.exchangeRate.toLocaleString('es-AR')}`} />
                <FichaRow label="Suma asegurada (USD)" value={formatCurrencyFull(policy.insuredAmountUsd, 'USD')} highlight />
              </div>
            </div>
          </div>
        </div>

        {/* Documentos asociados */}
        {documents.length > 0 && (
          <div className="px-8 py-6 border-t border-slate-200">
            <SectionHeading>
              Documentos Contables Asociados
              <span className="ml-1.5 text-xs font-normal text-slate-400">({documents.length})</span>
            </SectionHeading>
            <table className="w-full text-sm mt-3 border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-2 pr-4">N° Documento</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-2 pr-4">Tipo</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-2 pr-4">Emisión</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-2 pr-4">Total</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">{doc.documentNumber}</td>
                    <td className="py-2 pr-4 text-slate-600">{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</td>
                    <td className="py-2 pr-4 text-slate-600">{formatDate(doc.issueDate)}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-slate-800">{formatCurrencyFull(doc.totalAmount, doc.currency)}</td>
                    <td className="py-2 text-slate-600">{PAYMENT_STATUS_LABELS[doc.paymentStatus] ?? doc.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Firma */}
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
      <span className={`text-sm font-medium text-right min-w-0 break-words ${mono ? 'font-mono' : ''} ${highlight ? 'text-brand-700 font-semibold' : 'text-slate-800'}`}>
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
