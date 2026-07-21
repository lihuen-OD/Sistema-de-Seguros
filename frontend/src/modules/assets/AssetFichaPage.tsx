import { useParams, useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { FileDown, ArrowLeft, Loader2 } from 'lucide-react'
import { downloadAsPdf } from '../../shared/utils/downloadAsPdf'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import { assetQueries } from '../../shared/api/assets.api'
import { companyQueries } from '../../shared/api/companies.api'
import { costCenterQueries } from '../../shared/api/cost-centers.api'
import { ASSET_STATUS_LABELS } from '../../shared/constants'
import { LABEL_TO_CATEGORY } from '../../shared/constants/asset-categories'

const EMISSION_DATE = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const VEHICLE_CATS = new Set(['vehiculo', 'camioneta', 'camion', 'moto', 'tractor', 'cosechadora', 'pulverizadora', 'implemento'])
const LOCATION_CATS = new Set(['edificio', 'establecimiento'])
const HAS_CHASSIS = new Set(['vehiculo', 'camioneta', 'camion', 'moto', 'tractor', 'cosechadora', 'pulverizadora'])

export default function AssetFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fichaRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (!fichaRef.current || !asset) return
    setDownloading(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadAsPdf(fichaRef.current, `ficha-activo-${asset.internalCode}-${date}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const { data: asset } = useQuery(assetQueries.detail(id!))
  const { data: allCompanies = [] } = useQuery(companyQueries.list())
  const { data: allCostCenters = [] } = useQuery(costCenterQueries.list())
  const { data: allAttachments = [] } = useQuery(assetQueries.attachments(id!))

  if (!asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const coverPhoto = allAttachments.find(a => a.fileType === 'image')?.fileUrl

  const assetCategory = LABEL_TO_CATEGORY[asset.assetType]
  const isVehicle = VEHICLE_CATS.has(assetCategory ?? '')
  const isLocation = LOCATION_CATS.has(assetCategory ?? '')
  const hasChassis = HAS_CHASSIS.has(assetCategory ?? '')

  // Patrimonial values — sort history DESC to get latest entries
  const sortedHistory = [...(asset.valueHistory ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const latestReal = sortedHistory.find(e => e.type === 'real')
  const latestNuevo = sortedHistory.find(e => e.type === 'nuevo')
  const baseNuevo = asset.patrimonialValueNew != null && asset.patrimonialValueNew > 0 ? asset.patrimonialValueNew : null

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
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
          {downloading ? 'Generando…' : 'Descargar PDF'}
        </button>
      </div>

      {/* Document */}
      <div ref={fichaRef} className="max-w-[860px] mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

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
            {isVehicle && (
              <p className="text-sm text-slate-500 mt-1">
                {[asset.brand, asset.model, asset.year > 0 ? String(asset.year) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Valor patrimonial</p>
            <p className="text-xl font-bold text-brand-700 tabular-nums">
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
            {coverPhoto && (
              <img
                src={coverPhoto}
                alt={asset.name}
                className="w-full h-52 object-cover rounded-xl border border-slate-200 print:rounded-none"
              />
            )}

            <div>
              <SectionHeading>Características Técnicas</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Tipo de activo" value={asset.assetType || '—'} />
                <FichaRow label="Estado" value={ASSET_STATUS_LABELS[asset.status] ?? asset.status} />
                {asset.fixedAsset && <FichaRow label="Bien de uso" value={`${asset.fixedAsset.code} — ${asset.fixedAsset.name}`} />}

                {/* Campos específicos de vehículo */}
                {isVehicle && (
                  <>
                    {asset.brand && <FichaRow label="Marca" value={asset.brand} />}
                    {asset.model && <FichaRow label="Modelo" value={asset.model} />}
                    {asset.year > 0 && <FichaRow label="Año" value={String(asset.year)} />}
                    {asset.serialNumber && <FichaRow label="N° de serie" value={asset.serialNumber} />}
                    {hasChassis && asset.chassisNumber && <FichaRow label="N° de chasis" value={asset.chassisNumber} />}
                    {asset.engineNumber && <FichaRow label="N° de motor" value={asset.engineNumber} />}
                  </>
                )}

                {/* Campos específicos de implemento (sin chasis) */}
                {assetCategory === 'implemento' && (
                  <>
                    {asset.brand && <FichaRow label="Marca" value={asset.brand} />}
                    {asset.model && <FichaRow label="Modelo" value={asset.model} />}
                    {asset.serialNumber && <FichaRow label="N° de serie" value={asset.serialNumber} />}
                  </>
                )}

                {/* N° de serie para equipos/maquinaria */}
                {!isVehicle && assetCategory !== 'implemento' && !isLocation && asset.serialNumber && (
                  <FichaRow label="N° de serie" value={asset.serialNumber} />
                )}
              </div>
            </div>

            {/* Mapa para ubicaciones */}
            {isLocation && asset.coordinates && (
              <div>
                <SectionHeading>Ubicación</SectionHeading>
                <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm print:shadow-none">
                  <iframe
                    title="Mapa"
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${asset.coordinates.lng - 0.012},${asset.coordinates.lat - 0.012},${asset.coordinates.lng + 0.012},${asset.coordinates.lat + 0.012}&layer=mapnik&marker=${asset.coordinates.lat},${asset.coordinates.lng}`}
                    className="border-0 w-full"
                    style={{ height: 200 }}
                  />
                </div>
                {asset.mapsUrl && (
                  <p className="text-xs text-slate-400 mt-1 print:hidden">
                    <a href={asset.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                      Ver en Google Maps
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: valuación + imputación */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Valuación Patrimonial</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow
                  label="Valor patrimonial real"
                  value={formatCurrencyFull(asset.patrimonialValueUsd, 'USD')}
                  highlight
                />
                {latestReal && (
                  <FichaRow
                    label={`Valor real actualizado (${formatDate(latestReal.date)})`}
                    value={formatCurrencyFull(latestReal.valueUsd, 'USD')}
                    highlight
                  />
                )}
                {baseNuevo != null && (
                  <FichaRow
                    label="Valor patrimonial a nuevo"
                    value={formatCurrencyFull(baseNuevo, 'USD')}
                  />
                )}
                {latestNuevo && (
                  <FichaRow
                    label={`Valor a nuevo actualizado (${formatDate(latestNuevo.date)})`}
                    value={formatCurrencyFull(latestNuevo.valueUsd, 'USD')}
                  />
                )}
                {asset.valuationDate && (
                  <FichaRow label="Fecha de valuación" value={formatDate(asset.valuationDate)} />
                )}
              </div>
            </div>

            <div>
              <SectionHeading>Imputación Contable</SectionHeading>
              <div className="space-y-4">
                {(asset.allocations ?? []).map((alloc, idx) => {
                  const allocCompany = allCompanies.find(c => c.id === alloc.companyId)
                  const allocCostCenter = allCostCenters.find(cc => cc.id === alloc.costCenterId)
                  return (
                    <div key={alloc.id} className="space-y-2.5">
                      {(asset.allocations ?? []).length > 1 && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-1">
                          Imputación {idx + 1} · {alloc.percentage}%
                        </p>
                      )}
                      <FichaRow label="Empresa" value={allocCompany?.name ?? '—'} />
                      <FichaRow
                        label="Centro de costo"
                        value={allocCostCenter ? `${allocCostCenter.code} — ${allocCostCenter.name}` : '—'}
                      />
                    </div>
                  )
                })}
                {asset.productiveUnit && (
                  <FichaRow label="Unidad productiva" value={asset.productiveUnit} />
                )}
                {asset.area && (
                  <FichaRow label="Área" value={asset.area} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Silos (Establecimiento) ── */}
        {isLocation && asset.silos && asset.silos.length > 0 && (
          <div className="px-8 py-6 border-t border-slate-200">
            <SectionHeading>
              Silos / Celdas de Almacenamiento
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                ({asset.silos.length} silo{asset.silos.length !== 1 ? 's' : ''} · {asset.silos.reduce((s, x) => s + x.capacityTons, 0).toLocaleString('es-AR')} tn totales)
              </span>
            </SectionHeading>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {asset.silos.map((silo, idx) => (
                <div key={silo.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Silo {idx + 1}</p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{silo.capacityTons.toLocaleString('es-AR')} tn</p>
                  <p className="text-xs text-slate-500 mt-0.5">{silo.content || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Edificios (Establecimiento) ── */}
        {isLocation && asset.buildings && asset.buildings.length > 0 && (
          <div className="px-8 py-6 border-t border-slate-200">
            <SectionHeading>
              Edificios y Construcciones
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                ({asset.buildings.length} construcción{asset.buildings.length !== 1 ? 'es' : ''}
                {(() => {
                  const totalM2 = asset.buildings!.reduce((s, b) => s + (b.surfaceM2 ?? 0), 0)
                  return totalM2 > 0 ? ` · ${totalM2.toLocaleString('es-AR')} m² totales` : ''
                })()})
              </span>
            </SectionHeading>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {asset.buildings.map((building, idx) => (
                <div key={building.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-800 mb-2">{building.name || `Edificio ${idx + 1}`}</p>
                  <div className="space-y-1">
                    {building.surfaceM2 != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Superficie</span>
                        <span className="font-medium text-slate-700">{building.surfaceM2.toLocaleString('es-AR')} m²</span>
                      </div>
                    )}
                    {building.purpose && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Uso</span>
                        <span className="font-medium text-slate-700">{building.purpose}</span>
                      </div>
                    )}
                    {building.constructionType && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Estructura</span>
                        <span className="font-medium text-slate-700">{building.constructionType}</span>
                      </div>
                    )}
                    {building.constructionYear != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Año</span>
                        <span className="font-medium text-slate-700">{building.constructionYear}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
    <div className="flex items-start justify-between gap-4 min-w-0">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span
        className={`text-sm font-medium text-right min-w-0 break-words ${
          highlight ? 'text-brand-700 font-semibold' : 'text-slate-800'
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
