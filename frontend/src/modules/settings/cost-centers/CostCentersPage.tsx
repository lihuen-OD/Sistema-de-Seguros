import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Hash, Plus, Edit2, Trash2, CheckCircle2, XCircle, X, Save, Loader2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { OverflowCell } from '../../../shared/components/data-table/OverflowCell'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../../../shared/components/forms/FormSection'
import { notifyValidationErrors } from '../../../shared/utils/formValidation'
import { assetQueries } from '../../../shared/api/assets.api'
import { costCentersApi, costCenterQueries, costCenterKeys, type CostCenterInput } from '../../../shared/api/cost-centers.api'
import type { CostCenter, TableColumn } from '../../../shared/types'

// ─── Modal ────────────────────────────────────────────────────────────────────

interface CostCenterModalProps {
  costCenter: CostCenter | null
  onClose: () => void
  onSave: (input: CostCenterInput) => Promise<void>
}

function CostCenterModal({ costCenter, onClose, onSave }: CostCenterModalProps) {
  const isEdit = costCenter !== null

  const [name, setName] = useState(costCenter?.name ?? '')
  const [description, setDescription] = useState(costCenter?.description ?? '')
  const [status, setStatus] = useState<'activo' | 'inactivo'>(costCenter?.status ?? 'activo')
  const [errors, setErrors] = useState<{ name?: string }>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate(): boolean {
    const e: { name?: string } = {}
    if (!name.trim()) e.name = 'El nombre es obligatorio'
    setErrors(e)
    notifyValidationErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      await onSave({ name, description: description || undefined, status })
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Hash size={15} className="text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                {isEdit ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEdit ? costCenter!.code : 'El código se genera automáticamente'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <FormField label="Nombre" required error={errors.name} fullWidth>
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Producción Agrícola Norte"
              autoFocus
            />
          </FormField>
          <FormField label="Descripción" fullWidth>
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción o detalle del centro de costo (opcional)…"
              rows={3}
            />
          </FormField>
          <FormField label="Estado" fullWidth>
            <FormSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as 'activo' | 'inactivo')}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </FormSelect>
          </FormField>

          {apiError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {apiError}
            </p>
          )}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Guardar Cambios' : 'Crear Centro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostCentersPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalCC, setModalCC] = useState<CostCenter | null | undefined>(undefined)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: allCostCenters = [], isLoading, isError } = useQuery(costCenterQueries.list())

  const { data: allAssets = [] } = useQuery(assetQueries.list())

  const filtered = useMemo(() => {
    return allCostCenters.filter((cc) => {
      const q = search.toLowerCase()
      const matchSearch =
        !search ||
        cc.name.toLowerCase().includes(q) ||
        cc.code.toLowerCase().includes(q) ||
        cc.description.toLowerCase().includes(q)
      const matchStatus = !filterStatus || cc.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [search, filterStatus, allCostCenters])

  const activeCount = allCostCenters.filter((cc) => cc.status === 'activo').length
  const inactiveCount = allCostCenters.filter((cc) => cc.status === 'inactivo').length

  const STATUS_OPTIONS = [
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' },
  ]

  async function handleSave(input: CostCenterInput) {
    if (modalCC) {
      await costCentersApi.update(modalCC.id, input)
    } else {
      await costCentersApi.create(input)
    }
    setModalCC(undefined)
    queryClient.invalidateQueries({ queryKey: costCenterKeys.all })
  }

  async function handleDelete(id: string) {
    await costCentersApi.remove(id)
    queryClient.invalidateQueries({ queryKey: costCenterKeys.all })
    setDeleteId(null)
  }

  const columns: TableColumn<CostCenter>[] = [
    {
      key: 'code',
      label: 'Código',
      sortable: true,
      className: 'font-mono text-xs text-slate-600 min-w-[120px]',
    },
    {
      key: 'name',
      label: 'Centro de Costo',
      sortable: true,
      render: (v) => <span className="font-medium text-slate-800 text-sm">{String(v)}</span>,
    },
    {
      key: 'description',
      label: 'Descripción',
      sortable: true,
      render: (v) => (
        <div className="max-w-[260px]">
          <OverflowCell value={String(v) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      key: 'id',
      label: 'Activos',
      sortable: true,
      sortValue: (row) => allAssets.filter((a) => a.costCenterId === row.id && a.status === 'activo').length,
      render: (v) => {
        const count = allAssets.filter((a) => a.costCenterId === v && a.status === 'activo').length
        return <span className="text-xs text-slate-500">{count} activo{count !== 1 ? 's' : ''}</span>
      },
    },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setModalCC(row) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Editar centro de costo"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar centro de costo"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      className: 'w-20',
    },
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Centros de Costo"
        subtitle="Unidades de imputación contable para la asignación de activos"
        actions={
          <button
            onClick={() => setModalCC(null)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Centro de Costo
          </button>
        }
      />

      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label="Total"
          value={allCostCenters.length}
          description="Centros de costo registrados"
          icon={Hash}
          variant="default"
        />
        <KpiCard
          label="Activos"
          value={activeCount}
          description="Habilitados para imputación"
          icon={CheckCircle2}
          variant="success"
        />
        <KpiCard
          label="Inactivos"
          value={inactiveCount}
          description="Sin movimiento activo"
          icon={XCircle}
          variant={inactiveCount > 0 ? 'warning' : 'default'}
        />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, nombre o descripción…"
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              {
                key: 'status',
                label: 'Estado',
                options: STATUS_OPTIONS,
                value: filterStatus,
                onChange: setFilterStatus,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {isLoading ? 'Cargando…' : `${filtered.length} de ${allCostCenters.length} centros`}
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          emptyTitle="Sin centros de costo"
          emptyDescription="No se encontraron centros con los filtros aplicados."
          minWidth={640}
        />
      </SectionCard>

      {modalCC !== undefined && (
        <CostCenterModal
          costCenter={modalCC}
          onClose={() => setModalCC(undefined)}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar centro de costo"
        description={`¿Eliminar "${allCostCenters.find((cc) => cc.id === deleteId)?.name ?? 'este centro de costo'}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
