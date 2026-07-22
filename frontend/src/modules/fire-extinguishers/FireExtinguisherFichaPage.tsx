import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatDate } from '../../shared/utils/format'
import { downloadAsPdf } from '../../shared/utils/downloadAsPdf'
import { fireExtinguisherQueries } from '../../shared/api/fire-extinguishers.api'
import { assetQueries } from '../../shared/api/assets.api'
import { FIRE_EXT_STATUS_LABELS } from '../../shared/constants'

const EMISSION_DATE = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const LOCATION_TYPE_LABELS: Record<string, string> = {
  establecimiento: 'Establecimiento',
  oficina: 'Oficina',
  vehiculo: 'Vehículo',
  deposito: 'Depósito',
  otro: 'Otro',
}

export default function FireExtinguisherFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fichaRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  // Date.now() es una función impura — no se puede llamar directo en el
  // cuerpo del render, ni leer un ref durante el render (regla
  // react-hooks/purity). El inicializador lazy de useState corre una sola
  // vez al montar, nunca de nuevo en renders posteriores — para una ficha de
  // solo lectura no hace falta que se actualice sola si queda abierta mucho tiempo.
  const [now] = useState(() => Date.now())

  const { data: fe } = useQuery(fireExtinguisherQueries.detail(id!))
  const { data: history = [] } = useQuery(fireExtinguisherQueries.history(id!))
  const { data: assets = [] } = useQuery(assetQueries.list())

  if (!fe) {
    return (
      <PageContent>
        <EmptyState title="Matafuego no encontrado" description="El matafuego solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const asset = fe.associatedAssetId ? assets.find(a => a.id === fe.associatedAssetId) : null
  const recharges = history.filter(h => h.eventType === 'recarga').slice(0, 5)

  const daysToExpiry = fe.expirationDate
    ? Math.ceil((new Date(fe.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24))
    : null

  async function handleDownload() {
    if (!fichaRef.current) return
    setDownloading(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      await downloadAsPdf(fichaRef.current, `ficha-matafuego-${fe!.code}-${date}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PageContent>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(`/fire-extinguishers/${fe.id}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver al matafuego
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
            <p className="text-lg font-bold tracking-wide">FICHA DE MATAFUEGO</p>
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
              <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">{fe.code}</span>
              <StatusPill status={fe.status} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{fe.type}</h1>
            <p className="text-sm text-slate-500 mt-1">Capacidad: {fe.capacity}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Vencimiento</p>
            <p className={`text-xl font-bold tabular-nums ${daysToExpiry == null ? 'text-slate-900' : daysToExpiry < 0 ? 'text-red-600' : daysToExpiry <= 30 ? 'text-amber-600' : 'text-slate-900'}`}>
              {formatDate(fe.expirationDate)}
            </p>
            <p className={`text-xs mt-0.5 ${daysToExpiry == null ? 'text-slate-400' : daysToExpiry < 0 ? 'text-red-500' : daysToExpiry <= 30 ? 'text-amber-500' : 'text-slate-400'}`}>
              {daysToExpiry == null
                ? 'Sin fecha cargada'
                : daysToExpiry < 0
                  ? `Vencido hace ${Math.abs(daysToExpiry)} días`
                  : `Vence en ${daysToExpiry} días`}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">

          {/* Left */}
          <div className="p-8 space-y-6">
            <div>
              <SectionHeading>Datos Técnicos</SectionHeading>
              <div className="space-y-2.5">
                <FichaRow label="Código" value={fe.code} mono />
                <FichaRow label="Tipo" value={fe.type} />
                <FichaRow label="Capacidad" value={fe.capacity} />
                <FichaRow label="Estado" value={FIRE_EXT_STATUS_LABELS[fe.status] ?? fe.status} />
                <FichaRow label="Ubicación" value={LOCATION_TYPE_LABELS[fe.associatedLocationType] ?? fe.associatedLocationType} />
              </div>
            </div>

            <div>
              <SectionHeading>Fechas</SectionHeading>
              <div className="space-y-2.5">
                {fe.chargeDate && <FichaRow label="Última recarga" value={formatDate(fe.chargeDate)} />}
                <FichaRow label="Fecha de vencimiento" value={formatDate(fe.expirationDate)} highlight={daysToExpiry != null && daysToExpiry <= 30} />
                {fe.hydraulicTestExpirationDate && (
                  <FichaRow
                    label="Prueba hidráulica"
                    value={formatDate(fe.hydraulicTestExpirationDate)}
                    highlight={fe.hydraulicTestStatus !== 'vigente'}
                  />
                )}
              </div>
            </div>

            {fe.observations && (
              <div>
                <SectionHeading>Observaciones</SectionHeading>
                <p className="text-sm text-slate-700 leading-relaxed">{fe.observations}</p>
              </div>
            )}
          </div>

          {/* Right */}
          <div className="p-8 space-y-6">
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

            {recharges.length > 0 && (
              <div>
                <SectionHeading>Últimas Recargas</SectionHeading>
                <div className="space-y-2">
                  {recharges.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <span className="text-xs text-slate-500">{formatDate(r.eventDate)}</span>
                      {r.observations && (
                        <span className="text-xs text-slate-600 truncate ml-3 max-w-[180px]">{r.observations}</span>
                      )}
                    </div>
                  ))}
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
