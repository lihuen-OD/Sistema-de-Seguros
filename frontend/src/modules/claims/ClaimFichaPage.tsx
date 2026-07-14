import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import { downloadAsPdf } from '../../shared/utils/downloadAsPdf'
import { claimQueries } from '../../shared/api/claims.api'
import { assetQueries } from '../../shared/api/assets.api'
import { policyQueries } from '../../shared/api/policies.api'

const EMISSION_DATE = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function ClaimFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fichaRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const { data: claim } = useQuery(claimQueries.detail(id!))
  const { data: assets = [] } = useQuery(assetQueries.list())
  const { data: policies = [] } = useQuery(policyQueries.list())

  if (!claim) {
    return (
      <PageContent>
        <EmptyState title="Siniestro no encontrado" description="El siniestro solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const asset = claim.assetId ? assets.find(a => a.id === claim.assetId) : null
  const policy = claim.policyId ? policies.find(p => p.id === claim.policyId) : null

  async function handleDownload() {
    if (!fichaRef.current) return
    setDownloading(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadAsPdf(fichaRef.current, `ficha-siniestro-${claim!.claimNumber}-${date}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const currency = claim.currency ?? 'ARS'

  return (
    <PageContent>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(`/claims/${claim.id}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver al siniestro
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
            <p className="text-lg font-bold tracking-wide">FICHA DE SINIESTRO</p>
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
                {claim.claimNumber}
              </span>
              <StatusPill status={claim.status} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{claim.claimType}</h1>
            <p className="text-sm text-slate-500 mt-1">{claim.insuranceCompany}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Monto reclamado</p>
            <p className="text-xl font-bold text-blue-700 tabular-nums">
              {formatCurrencyFull(claim.claimedAmountArs, 'ARS')}
            </p>
            {claim.settledAmountArs != null && claim.settledAmountArs > 0 && (
              <p className="text-xs text-emerald-600 font-medium mt-0.5">
                Liquidado: {formatCurrencyFull(claim.settledAmountArs, 'ARS')}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">

          {/* Left */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Datos del Siniestro</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="N° de siniestro" value={claim.claimNumber} mono />
                <FichaRow label="Tipo de siniestro" value={claim.claimType} />
                <FichaRow label="Compañía aseguradora" value={claim.insuranceCompany} />
                <FichaRow label="Fecha de ocurrencia" value={formatDate(claim.occurrenceDate)} />
                <FichaRow label="Fecha de denuncia" value={formatDate(claim.reportDate)} />
                <FichaRow label="Estado" value={claim.status} />
              </div>
            </div>

            {claim.description && (
              <div>
                <SectionHeading>Descripción</SectionHeading>
                <p className="text-sm text-slate-700 leading-relaxed">{claim.description}</p>
              </div>
            )}

            {claim.observations && (
              <div>
                <SectionHeading>Observaciones</SectionHeading>
                <p className="text-sm text-slate-700 leading-relaxed">{claim.observations}</p>
              </div>
            )}
          </div>

          {/* Right */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Importes y Liquidación</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Monto reclamado (ARS)" value={formatCurrencyFull(claim.claimedAmountArs, 'ARS')} highlight />
                {claim.realAmountArs != null && claim.realAmountArs > 0 && (
                  <FichaRow label="Monto real estimado (ARS)" value={formatCurrencyFull(claim.realAmountArs, 'ARS')} />
                )}
                {claim.settledAmountArs != null && (
                  <FichaRow label="Monto liquidado (ARS)" value={formatCurrencyFull(claim.settledAmountArs, 'ARS')} highlight />
                )}
                {claim.deductibleArs != null && claim.deductibleArs > 0 && (
                  <FichaRow label="Deducible (ARS)" value={formatCurrencyFull(claim.deductibleArs, 'ARS')} />
                )}
                {claim.exchangeRate && claim.exchangeRate > 0 && (
                  <FichaRow label="Tipo de cambio" value={`$ ${claim.exchangeRate.toLocaleString('es-AR')}`} />
                )}
              </div>
            </div>

            {asset && (
              <div>
                <SectionHeading>Activo Asociado</SectionHeading>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
                  <FichaRow label="Código interno" value={asset.internalCode} mono />
                  <FichaRow label="Nombre" value={asset.name} />
                  <FichaRow label="Tipo" value={asset.assetType} />
                </div>
              </div>
            )}

            {policy && (
              <div>
                <SectionHeading>Póliza Vinculada</SectionHeading>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
                  <FichaRow label="N° de póliza" value={policy.policyNumber} mono />
                  <FichaRow label="Compañía" value={policy.insuranceCompany} />
                  <FichaRow label="Tipo" value={policy.insuranceType} />
                  <FichaRow label="Vencimiento" value={formatDate(policy.endDate)} />
                </div>
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
