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
  AlertTriangle,
  Info,
  MapPin,
  Plus,
  Trash2,
  ClipboardCheck,
  Droplet,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { Tabs, type TabItem } from '../../shared/components/tabs/Tabs'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { ROUTES } from '../../app/routes'
import { fireExtinguishersApi, fireExtinguisherKeys, fireExtinguisherQueries } from '../../shared/api/fire-extinguishers.api'
import type { RechargeInput } from '../../shared/api/fire-extinguishers.api'
import { fireExtinguisherAuditQueries } from '../../shared/api/fire-extinguisher-audits.api'
import type { FireExtinguisherAuditListItem } from '../../shared/api/fire-extinguisher-audits.api'
import { assetQueries } from '../../shared/api/assets.api'
import { FIRE_EXT_STATUS_LABELS } from '../../shared/constants'
import { RechargeModal } from './RechargeModal'
import type { FireExtinguisherHistory, TableColumn } from '../../shared/types'
import { useCurrentUser } from '../../app/auth/AuthContext'

const EVENT_ICON_CONFIG: Record<string, { bg: string; text: string; Icon: typeof RefreshCw }> = {
  Recarga: { bg: 'bg-emerald-100', text: 'text-emerald-600', Icon: RefreshCw },
  Vencimiento: { bg: 'bg-red-100', text: 'text-red-600', Icon: Flame },
  Alta: { bg: 'bg-brand-100', text: 'text-brand-600', Icon: Plus },
  Actualización: { bg: 'bg-amber-100', text: 'text-amber-600', Icon: Pencil },
  Baja: { bg: 'bg-slate-200', text: 'text-slate-600', Icon: Trash2 },
  Auditoría: { bg: 'bg-indigo-100', text: 'text-indigo-600', Icon: ClipboardCheck },
}

function TimelineItem({ item }: { item: FireExtinguisherHistory }) {
  const { bg, text, Icon } = EVENT_ICON_CONFIG[item.eventType] ?? { bg: 'bg-brand-100', text: 'text-brand-600', Icon: Clock }
  const hasChanges = item.changes && item.changes.length > 0

  return (
    <div className="flex gap-4 pb-5 last:pb-0">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${bg} ${text}`}>
          <Icon size={14} />
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

        {item.description && <p className="text-xs text-slate-500 mb-1">{item.description}</p>}

        {hasChanges ? (
          <div className="space-y-1 mb-1">
            {item.changes!.map((c) => (
              <div key={c.field} className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-slate-500 font-medium">{c.label}:</span>
                <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100 text-slate-500">
                  {c.previousValue ?? '—'}
                </span>
                <span className="text-slate-400">→</span>
                <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-medium">
                  {c.newValue ?? '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          (item.previousValue || item.newValue) && (
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
          )
        )}

        {item.observations && (
          <p className="text-xs text-slate-500">{item.observations}</p>
        )}
        <p className="text-xs text-slate-400 mt-1">Registrado por {item.createdBy}</p>
      </div>
    </div>
  )
}

const DETAIL_TABS: TabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: Info },
  { id: 'tecnico', label: 'Datos técnicos', icon: Flame },
  { id: 'ubicacion', label: 'Ubicación', icon: MapPin },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'auditorias', label: 'Auditorías', icon: ClipboardCheck },
  { id: 'vencimientos', label: 'Vencimientos', icon: AlertTriangle },
]

// Pendientes primero, igual criterio que en FireExtinguisherAuditsQueuePage.
const AUDIT_STATUS_SORT_ORDER: Record<string, number> = {
  SUBMITTED: 0,
  NEEDS_CORRECTION: 1,
  APPROVED: 2,
  REJECTED: 3,
}

const AUDIT_COLUMNS: TableColumn<FireExtinguisherAuditListItem>[] = [
  {
    key: 'auditPeriod',
    label: 'Período',
    sortable: true,
    render: (v) => <span className="text-sm text-slate-600">{v as string}</span>,
  },
  {
    key: 'auditedBy',
    label: 'Auditado por',
    sortable: true,
    render: (v) => <span className="text-sm text-slate-600">{v as string}</span>,
  },
  {
    key: 'auditDate',
    label: 'Fecha',
    sortable: true,
    render: (v) => <span className="text-sm text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
  },
  {
    key: 'proposedChangesCount',
    label: 'Cambios propuestos',
    sortable: true,
    render: (v) => {
      const count = v as number
      return count > 0 ? (
        <span className="inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
          {count}
        </span>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      )
    },
  },
  {
    key: 'status',
    label: 'Estado',
    sortable: true,
    sortValue: (row) => AUDIT_STATUS_SORT_ORDER[row.status] ?? 99,
    render: (v) => <StatusPill status={v as string} size="sm" />,
  },
]

export default function FireExtinguisherDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const [showRechargeModal, setShowRechargeModal] = useState(false)
  const [activeTab, setActiveTab] = useState('resumen')

  const { user } = useCurrentUser()
  // Mismos módulos que habilitan la pestaña/página de Auditorías de
  // Matafuegos — sin ninguno de los dos, ni siquiera se intenta el fetch.
  const canViewAudits =
    user?.role === 'ADMIN' ||
    (user?.modules.includes('fire_extinguisher_audits') ?? false) ||
    (user?.modules.includes('fire_extinguisher_audit_coverage') ?? false)

  const { data: fe, isLoading } = useQuery(fireExtinguisherQueries.detail(id!))

  const { data: history = [] } = useQuery(fireExtinguisherQueries.history(id!))

  const { data: audits = [], isLoading: auditsLoading } = useQuery({
    ...fireExtinguisherAuditQueries.list({ fireExtinguisherId: id! }),
    enabled: canViewAudits && !!id,
  })

  const { data: asset } = useQuery(assetQueries.detail(fe?.associatedAssetId ?? ''))

  async function handleRecharge(data: RechargeInput) {
    if (!fe) return
    await fireExtinguishersApi.recharge(fe.id, data)
    setShowRechargeModal(false)
    queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
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

  const days = fe.expirationDate ? daysUntil(fe.expirationDate) : null
  const isExpired = days != null && days < 0
  const isSoon = days != null && !isExpired && days <= 30

  const daysLabel = days == null ? 'Sin fecha' : isExpired ? `−${Math.abs(days)}d` : `${days}d`
  const daysDescription =
    days == null
      ? 'Falta cargar la fecha de vencimiento'
      : isExpired
        ? `Venció el ${formatDate(fe.expirationDate)}`
        : `Vence el ${formatDate(fe.expirationDate)}`

  const assetField = (
    <dd className="text-sm">
      {asset ? (
        <button
          onClick={() => navigate(`/assets/${asset.id}`)}
          className="text-brand-600 hover:underline text-left"
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
  )

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

      {/* Alert banner for expired or expiring soon (siempre visible, independiente de la pestaña activa) */}
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

      {/* Info banner when there's no expirationDate yet — registered on purpose without it, siempre visible */}
      {!fe.expirationDate && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
          <Calendar size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Este matafuego no tiene fecha de vencimiento cargada — no se incluye en el
            control de vencimientos ni en las alertas hasta que se complete. Completala
            desde &quot;Editar&quot;.
          </span>
        </div>
      )}

      {/* Alert banner for manufacturing life (independent of charge status), siempre visible */}
      {fe.manufacturingLifeStatus && fe.manufacturingLifeStatus !== 'vigente' && (
        <div
          className={`mb-5 flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
            fe.manufacturingLifeStatus === 'vencido'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            {fe.manufacturingLifeStatus === 'vencido'
              ? `Vida útil vencida (fabricado en ${fe.manufacturingYear}). Requiere reemplazo por antigüedad, más allá del estado de la carga.`
              : `Vida útil próxima a vencer (fabricado en ${fe.manufacturingYear}, límite ${fe.manufacturingExpirationYear}). Programar reemplazo por antigüedad.`}
          </span>
        </div>
      )}

      {/* Alert banner for hydraulic test (independent of charge/life status), siempre visible */}
      {fe.hydraulicTestStatus && fe.hydraulicTestStatus !== 'vigente' && (
        <div
          className={`mb-5 flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
            fe.hydraulicTestStatus === 'vencido'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <Droplet size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            {fe.hydraulicTestStatus === 'vencido'
              ? `Prueba hidráulica vencida (${formatDate(fe.hydraulicTestExpirationDate!)}). Requiere prueba y reemplazo del cilindro si corresponde.`
              : `Prueba hidráulica próxima a vencer (${formatDate(fe.hydraulicTestExpirationDate!)}). Programar la prueba del cilindro.`}
          </span>
        </div>
      )}

      {/* Recharge modal */}
      {showRechargeModal && (
        <RechargeModal
          extinguishers={[fe]}
          onConfirm={handleRecharge}
          onClose={() => setShowRechargeModal(false)}
        />
      )}

      <SectionCard noPadding className="mb-5">
        <Tabs
          tabs={DETAIL_TABS.filter((t) => t.id !== 'auditorias' || canViewAudits).map((t) => {
            if (t.id === 'historial') return { ...t, count: history.length }
            if (t.id === 'auditorias') return { ...t, count: audits.length }
            return t
          })}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === 'resumen' && (
          <div className="p-5">
            <MetricGrid cols={3} className="mb-5">
              <KpiCard
                label="Días para Vencer"
                value={daysLabel}
                description={daysDescription}
                icon={Calendar}
                variant={isExpired ? 'danger' : isSoon ? 'warning' : days == null ? 'default' : 'success'}
              />
              <KpiCard
                label="Estado"
                value={FIRE_EXT_STATUS_LABELS[fe.status] ?? fe.status}
                description="Estado actual del matafuego"
                icon={Flame}
                // Variant en base a fe.status (el peor entre carga, vida útil y
                // prueba hidráulica) — no a isExpired/isSoon, que son solo de
                // la fecha de carga. Si no, esta tarjeta podía decir "Próx. a
                // Vencer" en verde cuando lo que vencía pronto era la prueba
                // hidráulica, no la carga.
                variant={
                  fe.status === 'vencido'
                    ? 'danger'
                    : fe.status === 'proximo_vencer'
                      ? 'warning'
                      : fe.status === 'sin_fecha'
                        ? 'default'
                        : 'success'
                }
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
            </MetricGrid>

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
                <dt className="text-xs text-slate-500 mb-0.5">Fecha de Carga</dt>
                <dd className="text-sm text-slate-700 tabular-nums">{formatDate(fe.chargeDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 mb-0.5">Fecha de Vencimiento</dt>
                <dd className={`text-sm tabular-nums font-medium ${isExpired ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-slate-700'}`}>
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
          </div>
        )}

        {activeTab === 'tecnico' && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Tipo</dt>
              <dd className="text-sm text-slate-700">{fe.type}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Capacidad</dt>
              <dd className="text-sm text-slate-700 font-medium">{fe.capacity}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Marca</dt>
              <dd className="text-sm text-slate-700">{fe.brand ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">N° de cilindro</dt>
              <dd className="text-sm font-mono text-slate-700">{fe.cylinderNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Año de fabricación</dt>
              <dd className="text-sm text-slate-700">
                {fe.manufacturingYear ?? '—'}
                {fe.manufacturingExpirationYear && (
                  <span className="block text-xs text-slate-400 font-normal">
                    Vencimiento por vida útil: {fe.manufacturingExpirationYear}
                  </span>
                )}
              </dd>
            </div>
          </div>
        )}

        {activeTab === 'ubicacion' && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Establecimiento</dt>
              <dd className="text-sm text-slate-700">{fe.establishment ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Tipo de Ubicación</dt>
              <dd className="text-sm text-slate-700">{fe.associatedLocationType}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 mb-0.5">Activo Asociado</dt>
              {assetField}
            </div>
            {fe.location && (
              <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                <dt className="text-xs text-slate-500 mb-1">Detalle de ubicación</dt>
                <dd className="text-sm text-slate-600 leading-relaxed">{fe.location}</dd>
              </div>
            )}
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">
                {history.length} evento{history.length !== 1 ? 's' : ''} registrado{history.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <History size={13} />
                Altas, ediciones, bajas y recargas
              </span>
            </div>
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
          </div>
        )}

        {activeTab === 'auditorias' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">
                {audits.length} auditoría{audits.length !== 1 ? 's' : ''} registrada{audits.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <ClipboardCheck size={13} />
                Auditorías mensuales de este matafuego
              </span>
            </div>
            <DataTable
              columns={AUDIT_COLUMNS}
              data={audits}
              rowKey="id"
              loading={auditsLoading}
              onRowClick={(row) => navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL(row.id))}
              emptyTitle="Sin auditorías"
              emptyDescription="Todavía no se registraron auditorías para este matafuego."
              minWidth={640}
            />
          </div>
        )}

        {activeTab === 'vencimientos' && (
          <div className="p-5">
            <MetricGrid cols={3}>
              <KpiCard
                label="Estado de Carga"
                value={FIRE_EXT_STATUS_LABELS[fe.chargeStatus] ?? fe.chargeStatus}
                description={
                  !fe.expirationDate
                    ? 'Sin fecha de vencimiento cargada'
                    : fe.chargeDate
                      ? `Recargado el ${formatDate(fe.chargeDate)} · vence ${formatDate(fe.expirationDate)}`
                      : `Vence ${formatDate(fe.expirationDate)}`
                }
                icon={RefreshCw}
                variant={
                  fe.chargeStatus === 'vencido'
                    ? 'danger'
                    : fe.chargeStatus === 'proximo_vencer'
                      ? 'warning'
                      : fe.chargeStatus === 'sin_fecha'
                        ? 'default'
                        : 'success'
                }
              />
              <KpiCard
                label="Estado por Vida Útil"
                value={fe.manufacturingLifeStatus ? (FIRE_EXT_STATUS_LABELS[fe.manufacturingLifeStatus] ?? fe.manufacturingLifeStatus) : 'No aplica'}
                description={
                  fe.manufacturingYear
                    ? `Fabricado en ${fe.manufacturingYear} · límite ${fe.manufacturingExpirationYear}`
                    : 'Sin año de fabricación cargado'
                }
                icon={AlertTriangle}
                variant={
                  fe.manufacturingLifeStatus === 'vencido'
                    ? 'danger'
                    : fe.manufacturingLifeStatus === 'proximo_vencer'
                      ? 'warning'
                      : fe.manufacturingLifeStatus === 'vigente'
                        ? 'success'
                        : 'default'
                }
              />
              <KpiCard
                label="Estado de Prueba Hidráulica"
                value={fe.hydraulicTestStatus ? (FIRE_EXT_STATUS_LABELS[fe.hydraulicTestStatus] ?? fe.hydraulicTestStatus) : 'No aplica'}
                description={
                  fe.hydraulicTestExpirationDate
                    ? `Vence ${formatDate(fe.hydraulicTestExpirationDate)}`
                    : 'Sin fecha de prueba hidráulica cargada'
                }
                icon={Droplet}
                variant={
                  fe.hydraulicTestStatus === 'vencido'
                    ? 'danger'
                    : fe.hydraulicTestStatus === 'proximo_vencer'
                      ? 'warning'
                      : fe.hydraulicTestStatus === 'vigente'
                        ? 'success'
                        : 'default'
                }
              />
            </MetricGrid>
          </div>
        )}
      </SectionCard>
    </PageContent>
  )
}
