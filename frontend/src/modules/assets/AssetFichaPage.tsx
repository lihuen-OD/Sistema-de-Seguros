import { useParams, useNavigate } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import { assetsApi } from '../../shared/api/assets.api'
import { policiesApi } from '../../shared/api/policies.api'
import { companiesApi } from '../../shared/api/companies.api'
import { costCentersApi } from '../../shared/api/cost-centers.api'
import { ASSET_STATUS_LABELS } from '../../shared/constants'
import type { Policy } from '../../shared/types'

const EMISSION_DATE = '11/06/2026'

export default function AssetFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: asset } = useQuery({ queryKey: ['assets', id], queryFn: () => assetsApi.findById(id!) })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: allCompanies = [] } = useQuery({ queryKey: ['companies'], queryFn: companiesApi.findAll })
  const { data: allCostCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: costCentersApi.findAll })

  if (!asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const company = allCompanies.find((c) => c.id === asset?.companyId)
  const costCenter = allCostCenters.find((cc) => cc.id === asset?.costCenterId)
  const policies = allPolicies.filter((p) => p.assetId === asset?.id)
  const vigentPolicies = policies.filter((p) => p.status === 'vigente')

  const totalInsuredArs = vigentPolicies.reduce((s, p) => s + p.insuredAmountArs, 0)
  const totalInsuredUsd = vigentPolicies.reduce((s, p) => s + p.insuredAmountUsd, 0)

  return (
    <PageContent>
      {/* Action bar — hidden when printing */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={() => navigate(`/assets/${asset.id}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver al activo
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
        >
          <Printer size={15} />
          Imprimir / Guardar como PDF
        </button>
      </div>

      {/* Document */}
      <div className="max-w-[860px] mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:shadow-none print:border-0 print:rounded-none print:max-w-none">

        {/* ── Document header ── */}
        <div className="bg-slate-900 text-white px-8 py-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">
              Sistema de Administración Patrimonial, Seguros y Matafuegos
            </p>
            <p className="text-lg font-bold tracking-wide">FICHA PATRIMONIAL DE ACTIVO</p>
          </div>
          <div className="text-right flex-shrink-0 ml-8">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Emitido</p>
            <p className="text-sm font-semibold mt-0.5">{EMISSION_DATE}</p>
          </div>
        </div>

        {/* ── Asset identity bar ── */}
        <div className="px-8 py-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/40">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">
                {asset.internalCode}
              </span>
              <StatusPill status={asset.status} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{asset.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {[asset.brand, asset.model, asset.year > 0 ? String(asset.year) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Valor patrimonial</p>
            <p className="text-xl font-bold text-blue-700 tabular-nums">
              {formatCurrencyFull(asset.patrimonialValueUsd, 'USD')}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Al {formatDate(asset.valuationDate)}
            </p>
          </div>
        </div>

        {/* ── Main content: 2 cols ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">

          {/* Left: photo + características técnicas */}
          <div className="p-8 space-y-6">
            {asset.photos?.[0] && (
              <img
                src={asset.photos[0]}
                alt={asset.name}
                className="w-full h-52 object-cover rounded-xl border border-slate-200 print:rounded-none"
              />
            )}

            <div>
              <SectionHeading>Características Técnicas</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Tipo de activo" value={asset.assetType || '—'} />
                <FichaRow label="Marca" value={asset.brand || '—'} />
                <FichaRow label="Modelo" value={asset.model || '—'} />
                <FichaRow label="Año" value={asset.year > 0 ? String(asset.year) : '—'} />
                <FichaRow label="N° de serie / chasis" value={asset.serialNumber || '—'} />
                <FichaRow label="Código bien de uso" value={asset.fixedAssetCode || '—'} />
                <FichaRow label="Estado" value={ASSET_STATUS_LABELS[asset.status] ?? asset.status} />
              </div>
            </div>
          </div>

          {/* Right: valuación + imputación */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Valuación Patrimonial</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow
                  label="Valor patrimonial"
                  value={formatCurrencyFull(asset.patrimonialValueUsd, 'USD')}
                  highlight
                />
                <FichaRow label="Fecha de valuación" value={formatDate(asset.valuationDate)} />
              </div>
            </div>

            <div>
              <SectionHeading>Imputación Contable</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Empresa" value={company?.name ?? '—'} />
                <FichaRow
                  label="Centro de costo"
                  value={costCenter ? `${costCenter.code} — ${costCenter.name}` : '—'}
                />
                <FichaRow label="Unidad productiva" value={asset.productiveUnit || '—'} />
                <FichaRow label="Área" value={asset.area || '—'} />
              </div>
            </div>

            {vigentPolicies.length > 0 && (
              <div>
                <SectionHeading>Resumen de Cobertura</SectionHeading>
                <div className="space-y-2.5">
                  <FichaRow
                    label="Pólizas vigentes"
                    value={String(vigentPolicies.length)}
                  />
                  <FichaRow
                    label="Suma asegurada ARS"
                    value={formatCurrencyCompact(totalInsuredArs, 'ARS')}
                    highlight
                  />
                  {totalInsuredUsd > 0 && (
                    <FichaRow
                      label="Suma asegurada USD"
                      value={formatCurrencyFull(totalInsuredUsd, 'USD')}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Policies table ── */}
        {policies.length > 0 && (
          <div className="px-8 py-6 border-t border-slate-200">
            <SectionHeading>
              Pólizas de Seguros
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                ({policies.length} póliza{policies.length !== 1 ? 's' : ''})
              </span>
            </SectionHeading>
            <table className="w-full mt-4 text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {['N° Póliza', 'Aseguradora', 'Tipo', 'Cobertura', 'Suma aseg. ARS', 'Vigencia', 'Estado'].map((h) => (
                    <th key={h} className="text-left pb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide pr-4 last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policies.map((p: Policy) => (
                  <tr key={p.id} className="text-xs">
                    <td className="py-2.5 pr-4 font-mono text-slate-600">{p.policyNumber}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{p.insuranceCompany}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{p.insuranceType}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.coverageType}</td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-800 tabular-nums">
                      {formatCurrencyCompact(p.insuredAmountArs, 'ARS')}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {formatDate(p.startDate)} — {formatDate(p.endDate)}
                    </td>
                    <td className="py-2.5">
                      <StatusPill status={p.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Observations ── */}
        {asset.observations && (
          <div className="px-8 py-6 border-t border-slate-200">
            <SectionHeading>Observaciones</SectionHeading>
            <p className="text-sm text-slate-700 leading-relaxed mt-3">{asset.observations}</p>
          </div>
        )}

        {/* ── Signature footer ── */}
        <div className="px-8 py-8 border-t border-slate-200 bg-slate-50/50 grid grid-cols-3 gap-8">
          <SignatureLine label="Preparado por" />
          <SignatureLine label="Revisado por" />
          <SignatureLine label="Autorizado por" />
        </div>
      </div>

      {/* Bottom spacing */}
      <div className="h-8 print:hidden" />
    </PageContent>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-2">
      {children}
    </p>
  )
}

function FichaRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 min-w-0">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span
        className={`text-sm font-medium text-right truncate ${
          highlight ? 'text-blue-700 font-semibold' : 'text-slate-800'
        }`}
      >
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
