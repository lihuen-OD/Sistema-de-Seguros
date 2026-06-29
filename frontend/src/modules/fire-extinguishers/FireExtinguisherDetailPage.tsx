import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Flame,
  Calendar,
  RefreshCw,
  Building2,
  History,
  Pencil,
  ArrowLeft,
  Clock,
  FileDown,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { ROUTES } from '../../app/routes'
import { fireExtinguishersApi } from '../../shared/api/fire-extinguishers.api'
import type { RechargeInput } from '../../shared/api/fire-extinguishers.api'
import { assetsApi } from '../../shared/api/assets.api'
import { LOCATION_TYPES, FIRE_EXT_STATUS_LABELS } from '../../shared/constants'
import { RechargeModal } from './RechargeModal'
import type { FireExtinguisherHistory } from '../../shared/types'

function TimelineItem({ item }: { item: FireExtinguisherHistory }) {
  const isCharge = item.eventType === 'Recarga'
  const isExpiry = item.eventType === 'Vencimiento'

  return (
    <div className="flex gap-4 pb-5 last:pb-0">
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isCharge
              ? 'bg-emerald-100 text-emerald-600'
              : isExpiry
                ? 'bg-red-100 text-red-600'
                : 'bg-blue-100 text-blue-600'
          }`}
        >
          {isCharge ? (
            <RefreshCw size={14} />
          ) : isExpiry ? (
            <Flame size={14} />
          ) : (
            <Clock size={14} />
          )}
        </div>
        <div className="w-px flex-1 bg-slate-100 mt-1" />
      </div>

      <div className="pb-1 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3 mb-1">
          <span className="text-sm font-semibold text-slate-800">{item.eventType}</span>
          <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap flex-shrink-0">
            {formatDate(item.eventDate)}
          </span>
        </div>
        {(item.previousValue || item.newValue) && (
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {item.previousValue && (
              <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                {item.previousValue}
              </span>
            )}
            {item.previousValue && item.newValue && (
              <span className="text-xs text-slate-400">→</span>
            )}
            {item.newValue && (
              <span className="text-xs text-slate-700 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200 font-medium">
                {item.newValue}
              </span>
            )}
          </div>
        )}
        {item.observations && (
          <p className="text-xs text-slate-500">{item.observations}</p>
        )}
        <p className="text-xs text-slate-400 mt-1">Registrado por {item.createdBy}</p>
      </div>
    </div>
  )
}

export default function FireExtinguisherDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const [showRechargeModal, setShowRechargeModal] = useState(false)

  const { data: fe, isLoading } = useQuery({
    queryKey: ['fire-extinguishers', id],
    queryFn: () => fireExtinguishersApi.findById(id!),
    enabled: !!id,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['fire-extinguishers', id, 'history'],
    queryFn: () => fireExtinguishersApi.findHistory(id!),
    enabled: !!id,
  })

  const { data: asset } = useQuery({
    queryKey: ['assets', fe?.associatedAssetId],
    queryFn: () => assetsApi.findById(fe!.associatedAssetId!),
    enabled: !!fe?.associatedAssetId,
  })

  async function handleRecharge(data: RechargeInput) {
    if (!fe) return
    await fireExtinguishersApi.recharge(fe.id, data)
    setShowRechargeModal(false)
    queryClient.invalidateQueries({ queryKey: ['fire-extinguishers', id] })
    queryClient.invalidateQueries({ queryKey: ['fire-extinguishers'] })
  }

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
          Cargando matafuego…
        </div>
      </PageContent>
    )
  }

  if (!fe) {
    return (
      <PageContent>
        <ErrorState
          title="Matafuego no encontrado"
          description="El matafuego que buscás no existe o fue eliminado."
          action={
            <button
              onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowLeft size={15} />
              Volver a matafuegos
            </button>
          }
        />
      </PageContent>
    )
  }

  const days = daysUntil(fe.expirationDate)
  const isExpired = days < 0
  const isSoon = !isExpired && days <= 30

  const daysLabel = isExpired ? `−${Math.abs(days)}d` : `${days}d`
  const daysDescription = isExpired
    ? `Venció el ${formatDate(fe.expirationDate)}`
    : `Vence el ${formatDate(fe.expirationDate)}`

  return (
    <PageContent>
      <PageHeader
        title={`Matafuego ${fe.code}`}
        subtitle={`${fe.type} · ${fe.capacity}`}
        category="Matafuego"
        backTo={ROUTES.FIRE_EXTINGUISHERS}
        backLabel="Volver a matafuegos"
        badge={<StatusPill status={fe.status} />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRechargeModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={15} />
              Registrar Recarga
            </button>
            <button
              onClick={() => navigate(`/fire-extinguishers/${fe.id}/ficha`)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <FileDown size={15} />
              Ficha PDF
            </button>
            <button
              onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_EDIT(fe.id))}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <Pencil size={15} />
              Editar
            </button>
          </div>
        }
      />

      {/* Alert banner for expired or expiring soon */}
      {(isExpired || isSoon) && (
        <div
          className={`mb-5 flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
            isExpired
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <Flame size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            {isExpired
              ? `Este matafuego venció hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}. Requiere recarga o reemplazo inmediato.`
              : `Este matafuego vence en ${days} día${days !== 1 ? 's' : ''} (${formatDate(fe.expirationDate)}). Programar recarga preventiva.`}
          </span>
        </div>
      )}

      {/* 2-column layout: LEFT details card, RIGHT KPI cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* LEFT: ficha técnica */}
        <SectionCard title="Ficha Técnica" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Código</dt>
              <dd className="text-sm font-mono font-semibold text-slate-800">{fe.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Tipo</dt>
              <dd className="text-sm text-slate-700">{fe.type}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Capacidad</dt>
              <dd className="text-sm text-slate-700 font-medium">{fe.capacity}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Estado</dt>
              <dd><StatusPill status={fe.status} size="sm" /></dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Tipo de Ubicación</dt>
              <dd className="text-sm text-slate-700">
                {LOCATION_TYPES[fe.associatedLocationType] ?? fe.associatedLocationType}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Activo Asociado</dt>
              <dd className="text-sm">
                {asset ? (
                  <button
                    onClick={() => navigate(`/assets/${asset.id}`)}
                    className="text-blue-600 hover:underline text-left"
                  >
                    {asset.name}
                    <span className="block text-xs text-slate-400 font-normal">
                      {asset.internalCode} · {asset.assetType}
                    </span>
                  </button>
                ) : (
                  <span className="text-slate-400">Sin activo asociado</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Fecha de Carga</dt>
              <dd className="text-sm text-slate-700 tabular-nums">{formatDate(fe.chargeDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Fecha de Vencimiento</dt>
              <dd
                className={`text-sm tabular-nums font-medium ${
                  isExpired ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-slate-700'
                }`}
              >
                {formatDate(fe.expirationDate)}
              </dd>
            </div>
            {fe.observations && (
              <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                <dt className="text-xs text-slate-500 mb-1">Observaciones</dt>
                <dd className="text-sm text-slate-600 leading-relaxed">{fe.observations}</dd>
              </div>
            )}
          </div>
        </SectionCard>

        {/* RIGHT: KPI cards stacked */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <KpiCard
            label="Días para Vencer"
            value={daysLabel}
            description={daysDescription}
            icon={Calendar}
            variant={isExpired ? 'danger' : isSoon ? 'warning' : 'success'}
          />
          <KpiCard
            label="Estado"
            value={FIRE_EXT_STATUS_LABELS[fe.status] ?? fe.status}
            description="Estado actual del matafuego"
            icon={Flame}
            variant={isExpired ? 'danger' : isSoon ? 'warning' : 'success'}
          />
          {asset ? (
            <KpiCard
              label="Activo Asociado"
              value={asset.name.length > 22 ? asset.name.slice(0, 22) + '…' : asset.name}
              description={`${asset.internalCode} · ${asset.assetType}`}
              icon={Building2}
              variant="info"
            />
          ) : (
            <KpiCard
              label="Sin Activo"
              value="—"
              description="No asociado a ningún activo"
              icon={Building2}
              variant="default"
            />
          )}
        </div>
      </div>

      {/* Recharge modal */}
      {showRechargeModal && (
        <RechargeModal
          extinguishers={[fe]}
          onConfirm={handleRecharge}
          onClose={() => setShowRechargeModal(false)}
        />
      )}

      {/* History as timeline */}
      <SectionCard
        title="Historial"
        subtitle={`${history.length} evento${history.length !== 1 ? 's' : ''} registrado${history.length !== 1 ? 's' : ''}`}
        actions={
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <History size={13} />
            Cargas y cambios
          </span>
        }
      >
        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <History size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin historial registrado</p>
            <p className="text-xs mt-1">
              Los eventos de recarga y cambios aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="pt-1">
            {history.map((item) => (
              <TimelineItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </SectionCard>
    </PageContent>
  )
}
