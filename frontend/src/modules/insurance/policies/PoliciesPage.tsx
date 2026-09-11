import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, ShieldOff, AlertTriangle, DollarSign, Eye, Trash2, Archive } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { PaginationControls } from '../../../shared/components/data-table/PaginationControls'
import { OverflowCell } from '../../../shared/components/data-table/OverflowCell'
import { ColumnConfigButton } from '../../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../../shared/components/data-table/ExportPresetsButton'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { policiesApi, policyKeys, policyQueries } from '../../../shared/api/policies.api'
import { documentKeys } from '../../../shared/api/documents.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { POLICY_STATUS_LABELS } from '../../../shared/constants'
import { useColumnConfig } from '../../../shared/hooks/useColumnConfig'
import type { Policy, TableColumn } from '../../../shared/types'

const STATUS_OPTIONS = Object.entries(POLICY_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Orden por severidad al ordenar la columna "Estado" — alfabético dejaría
// "de_baja" antes que "vigente", que no refleja el ciclo de vida real de la
// póliza. Mismo orden que POLICY_STATUS_LABELS.
const POLICY_STATUS_SORT_ORDER: Record<string, number> = {
  vigente: 0,
  proximo_vencer: 1,
  vencida: 2,
  de_baja: 3,
}
const DEFAULT_PAGE_SIZE = 20

export default function PoliciesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deBajaId, setDeBajaId] = useState<string | null>(null)
  // En vuelo (no "cuál fila tiene el diálogo abierto", eso ya es deleteId/
  // deBajaId) — gatea el botón "Confirmar" del ConfirmDialog para que un
  // doble click no dispare dos DELETE/POST seguidos para el mismo id (el
  // segundo llegaba a un recurso que el primero ya había borrado/dado de
  // baja, y el backend respondía 404).
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  const { data: result, isLoading, isFetching, isError } = useQuery(policyQueries.listPaginated({
    page,
    limit,
    search: search.trim() || undefined,
    status: filterStatus ? filterStatus as Policy['status'] : undefined,
  }))
  const allPolicies = useMemo(() => result?.data ?? [], [result?.data])
  const pagination = result?.pagination
  const { data: allProducers = [] } = useQuery(producerQueries.list())

  async function handleDelete(id: string) {
    setIsDeleting(true)
    try {
      await policiesApi.hardDelete(id)
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      // Eliminar la póliza la desvincula (sin borrarlos) de los documentos
      // contables que la referencian — sin esto, DocumentsPage y el detalle de
      // esos documentos seguían mostrando la distribución/póliza vieja.
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      setDeleteId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleDeBaja(id: string) {
    setIsDeactivating(true)
    try {
      await policiesApi.markAsDeBaja(id)
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      // policyKeys.detail (['policy', id]) es un árbol de caché separado de
      // policyKeys.all (['policies']) — sin invalidarlo, PolicyDetailPage
      // seguía mostrando el estado "vencida" viejo hasta recargar la página.
      queryClient.invalidateQueries({ queryKey: policyKeys.detail(id) })
      setDeBajaId(null)
    } finally {
      setIsDeactivating(false)
    }
  }

  const filtered = allPolicies

  const counts = useMemo(() => ({
    vigente: allPolicies.filter((p) => p.status === 'vigente').length,
    vencida: allPolicies.filter((p) => p.status === 'vencida').length,
    proximo_vencer: allPolicies.filter((p) => p.status === 'proximo_vencer').length,
  }), [allPolicies])

  // "Próxima a vencer" sigue teniendo cobertura activa — si se cuenta solo
  // 'vigente' se subestima la suma asegurada real (mismo criterio ya usado en
  // AssetDetailPage.tsx para "seguro vigente").
  const activeInsuredPolicies = useMemo(
    () => allPolicies.filter((p) => p.status === 'vigente' || p.status === 'proximo_vencer'),
    [allPolicies],
  )
  const totalInsuredArs = useMemo(
    () => activeInsuredPolicies.reduce((s, p) => s + (p.totalInsuredAmountArs ?? 0), 0),
    [activeInsuredPolicies],
  )
  const totalInsuredUsd = useMemo(
    () => activeInsuredPolicies.reduce((s, p) => s + (p.totalInsuredAmountUsd ?? 0), 0),
    [activeInsuredPolicies],
  )

  const ALL_COLUMNS: TableColumn<Policy>[] = useMemo(() => [
    {
      id: 'policyNumber',
      key: 'policyNumber',
      label: 'N° Póliza',
      defaultVisible: true,
      sortable: true,
      className: 'font-mono text-slate-600 text-xs',
    },
    {
      id: 'insuranceCompany',
      key: 'insuranceCompany',
      label: 'Aseguradora',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="font-medium text-slate-800">{String(v)}</span>,
    },
    {
      id: 'producerId',
      key: 'producerId',
      label: 'Productor',
      defaultVisible: true,
      sortable: true,
      sortValue: (row) => allProducers.find((p) => p.id === row.producerId)?.name,
      exportValue: (row) => allProducers.find((p) => p.id === row.producerId)?.name ?? '',
      render: (v) => {
        const producer = allProducers.find((p) => p.id === v)
        return (
          <div className="max-w-[180px]">
            <OverflowCell value={producer?.name ?? null} lines={1} className="text-xs text-slate-500" />
          </div>
        )
      },
    },
    {
      id: 'insuranceTypeNames',
      key: 'insuranceTypeNames',
      label: 'Tipo(s) de Seguro',
      defaultVisible: true,
      sortable: true,
      sortValue: (row) => (row.insuranceTypeNames ?? []).join(', '),
      exportValue: (row) => (row.insuranceTypeNames ?? []).join(', '),
      render: (_v, row) => {
        const label = (row.insuranceTypeNames ?? []).join(', ') || null
        return (
          <div className="max-w-[180px]">
            <OverflowCell value={label} lines={1} className="text-xs text-slate-500" />
          </div>
        )
      },
    },
    {
      id: 'assetNames',
      key: 'assetNames',
      label: 'Activos Cubiertos',
      defaultVisible: true,
      sortable: true,
      sortValue: (row) => (row.assetNames ?? []).join(', ') || (row.hasSinActivo ? 'Sin activo' : ''),
      exportValue: (row) => (row.assetNames ?? []).join(', ') || (row.hasSinActivo ? 'Sin activo asociado' : ''),
      render: (_v, row) => {
        const names = row.assetNames ?? []
        if (names.length === 0) {
          return row.hasSinActivo
            ? <span className="text-xs text-slate-500">Sin activo asociado</span>
            : <span className="text-slate-400">—</span>
        }
        const label = row.hasSinActivo ? `${names.join(', ')} + sin activo` : names.join(', ')
        return (
          <div className="max-w-[200px]">
            <OverflowCell value={label} lines={1} className="text-xs text-slate-700" />
          </div>
        )
      },
    },
    {
      id: 'startDate',
      key: 'startDate',
      label: 'Inicio',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      id: 'endDate',
      key: 'endDate',
      label: 'Vencimiento',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      id: 'totalInsuredAmountArs',
      key: 'totalInsuredAmountArs',
      label: 'Suma aseg. ARS',
      defaultVisible: true,
      sortable: true,
      exportValue: (row) => String(row.totalInsuredAmountArs ?? 0),
      render: (v) => (
        <span className="font-semibold text-slate-800 tabular-nums">
          {(v as number) > 0 ? formatCurrencyFull(v as number, 'ARS') : <span className="text-slate-400">—</span>}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      sortable: true,
      sortValue: (row) => POLICY_STATUS_SORT_ORDER[row.status] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'totalInsuredAmountUsd',
      key: 'totalInsuredAmountUsd',
      label: 'Suma aseg. USD',
      defaultVisible: false,
      sortable: true,
      exportValue: (row) => String(row.totalInsuredAmountUsd ?? 0),
      render: (v) => (
        <span className="tabular-nums text-slate-700">
          {(v as number) > 0 ? formatCurrencyFull(v as number, 'USD') : <span className="text-slate-400">—</span>}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'coverageCount',
      key: 'coverageCount',
      label: 'Líneas de cobertura',
      defaultVisible: false,
      sortable: true,
      exportValue: (row) => String(row.coverageCount ?? 0),
      render: (v) => <span className="text-sm font-medium text-slate-700">{(v as number) ?? 0}</span>,
      className: 'text-center',
      headerClassName: 'text-center',
    },
    {
      id: 'description',
      key: 'description',
      label: 'Descripción',
      defaultVisible: false,
      sortable: true,
      render: (v) => (
        <div className="max-w-[200px]">
          <OverflowCell value={(v as string) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      id: 'attachmentsCount',
      key: 'attachmentsCount',
      label: 'Adjuntos',
      defaultVisible: false,
      sortable: true,
      exportValue: (row) => String(row.attachmentsCount ?? 0),
      render: (v) => {
        const n = v as number | undefined
        return n != null && n > 0
          ? <span className="text-sm font-medium text-slate-700">{n}</span>
          : <span className="text-slate-400">—</span>
      },
      className: 'text-center',
      headerClassName: 'text-center',
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      label: 'Fecha de alta',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    // ── Acciones ────────────────────────────────────────────────────────────────
    {
      id: 'actions',
      key: 'id',
      label: '',
      hideable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/insurance/policies/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <Eye size={15} />
          </button>
          {row.status !== 'de_baja' && (
            <button
              onClick={(e) => { e.stopPropagation(); setDeBajaId(row.id) }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Dar de baja"
              aria-label="Dar de baja"
            >
              <Archive size={15} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar póliza"
            aria-label="Eliminar póliza"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      className: 'w-28',
    },
  ], [allProducers, navigate])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('policies', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Pólizas de Seguros"
        subtitle="Administración de pólizas vigentes, vencidas y próximas a vencer"
        actions={
          <button
            onClick={() => navigate('/insurance/policies/new')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva Póliza
          </button>
        }
      />

      <MetricGrid cols={4} className="mb-6">
        <KpiCard label="Vigentes" value={counts.vigente} description="En esta página" icon={ShieldCheck} variant="success" />
        <KpiCard label="Vencidas" value={counts.vencida} description="En esta página" icon={ShieldOff} variant="danger" />
        <KpiCard label="Próximas a Vencer" value={counts.proximo_vencer} description="En esta página" icon={AlertTriangle} variant="warning" />
        <KpiCard label="Suma Asegurada" value={formatCurrencyCompact(totalInsuredUsd, 'USD')} description={`${formatCurrencyCompact(totalInsuredArs, 'ARS')} · esta página`} icon={DollarSign} variant="info" />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(value) => { setPage(1); setSearch(value) }}
            placeholder="Buscar por N° póliza, aseguradora, tipo o activo…"
            className="w-full sm:w-72"
          />
          <FilterBar filters={[{
            key: 'status', label: 'Estado', options: STATUS_OPTIONS, value: filterStatus,
            onChange: (value) => { setPage(1); setFilterStatus(value) },
          }]} />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} visibles en esta página · {pagination?.total ?? 0} resultados
            </span>
            <ExportPresetsButton
              tableKey="policies"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="polizas"
              onApplyPreset={applyPreset}
            />
            <span className="text-[11px] text-slate-400">Ordena y exporta la página actual</span>
            <ColumnConfigButton
              columnConfigs={columnConfigs}
              onToggle={toggle}
              onReorder={reorder}
              onReset={reset}
            />
          </div>
        </div>
        <DataTable
          tableKey="policies"
          columns={visibleColumns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/policies/${row.id}`)}
          emptyTitle="Sin pólizas"
          emptyDescription="No se encontraron pólizas con los filtros aplicados."
          minWidth={900}
        />
        {pagination && (
          <PaginationControls
            {...pagination}
            isLoading={isFetching}
            onPageChange={setPage}
            onLimitChange={(nextLimit) => {
              setPage(1)
              setLimit(nextLimit)
            }}
          />
        )}
      </SectionCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar póliza"
        description={`¿Eliminar la póliza "${allPolicies.find((p) => p.id === deleteId)?.policyNumber ?? ''}" de forma permanente? Esta acción no se puede deshacer. Se van a eliminar sus líneas de cobertura y adjuntos, y se va a desvincular (sin borrarlos) de los documentos contables, siniestros y tareas que la referencian — esos registros quedan, pero sin esta póliza asociada, y las Facturas/Notas/Endosos ya cargados pierden la distribución por activo que tenían contra ella.`}
        confirmLabel="Eliminar definitivamente"
        loading={isDeleting}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={deBajaId !== null}
        title="Dar de baja la póliza"
        description={`¿Dar de baja la póliza "${allPolicies.find((p) => p.id === deBajaId)?.policyNumber ?? ''}"? Pasará a estado "De Baja" de forma permanente.`}
        confirmLabel="Dar de baja"
        loading={isDeactivating}
        onConfirm={() => deBajaId && handleDeBaja(deBajaId)}
        onCancel={() => setDeBajaId(null)}
      />
    </PageContent>
  )
}
