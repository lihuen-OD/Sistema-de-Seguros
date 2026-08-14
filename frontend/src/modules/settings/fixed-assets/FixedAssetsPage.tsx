import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Plus, Edit2, Trash2, CheckCircle2, XCircle, Save, Loader2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { OverflowCell } from '../../../shared/components/data-table/OverflowCell'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { Modal } from '../../../shared/components/modals/Modal'
import { SimpleCrudManager } from '../../../shared/components/crud/SimpleCrudManager'
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../../../shared/components/forms/FormSection'
import { notifyValidationErrors } from '../../../shared/utils/formValidation'
import { assetQueries } from '../../../shared/api/assets.api'
import { fixedAssetsApi, fixedAssetQueries, fixedAssetKeys, type FixedAssetInput } from '../../../shared/api/fixed-assets.api'
import type { BienDeUso, TableColumn } from '../../../shared/types'

// ─── Modal ────────────────────────────────────────────────────────────────────

interface FixedAssetModalProps {
  fixedAsset: BienDeUso | null
  onClose: () => void
  onSave: (input: FixedAssetInput) => Promise<void>
}

function FixedAssetModal({ fixedAsset, onClose, onSave }: FixedAssetModalProps) {
  const isEdit = fixedAsset !== null

  const [name, setName] = useState(fixedAsset?.name ?? '')
  const [description, setDescription] = useState(fixedAsset?.description ?? '')
  const [status, setStatus] = useState<'activo' | 'inactivo'>(fixedAsset?.status ?? 'activo')
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
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={Boxes}
      iconClassName="bg-brand-50 text-brand-600"
      title={isEdit ? 'Editar Bien de Uso' : 'Nuevo Bien de Uso'}
      description={isEdit ? fixedAsset!.code : 'El código se genera automáticamente'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre" required error={errors.name} fullWidth>
          <FormInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Camioneta doble cabina 4×4"
            autoFocus
          />
        </FormField>
        <FormField label="Descripción" fullWidth>
          <FormTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción o detalle del bien de uso (opcional)…"
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
            {isEdit ? 'Guardar Cambios' : 'Crear Bien de Uso'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FixedAssetsPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalFA, setModalFA] = useState<BienDeUso | null | undefined>(undefined)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: allFixedAssets = [], isLoading, isError } = useQuery(fixedAssetQueries.list())

  const { data: allAssets = [] } = useQuery(assetQueries.list())

  const filtered = useMemo(() => {
    return allFixedAssets.filter((fa) => {
      const q = search.toLowerCase()
      const matchSearch =
        !search ||
        fa.name.toLowerCase().includes(q) ||
        fa.code.toLowerCase().includes(q) ||
        fa.description.toLowerCase().includes(q)
      const matchStatus = !filterStatus || fa.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [search, filterStatus, allFixedAssets])

  const activeCount = allFixedAssets.filter((fa) => fa.status === 'activo').length
  const inactiveCount = allFixedAssets.filter((fa) => fa.status === 'inactivo').length

  async function handleSave(input: FixedAssetInput) {
    if (modalFA) {
      await fixedAssetsApi.update(modalFA.id, input)
    } else {
      await fixedAssetsApi.create(input)
    }
    await queryClient.invalidateQueries({ queryKey: fixedAssetKeys.all })
    setModalFA(undefined)
  }

  async function handleDelete(id: string) {
    await fixedAssetsApi.remove(id)
    await queryClient.invalidateQueries({ queryKey: fixedAssetKeys.all })
    setDeleteId(null)
  }

  const columns: TableColumn<BienDeUso>[] = [
    {
      key: 'code',
      label: 'Código',
      sortable: true,
      className: 'font-mono text-xs text-slate-600 min-w-[120px]',
    },
    {
      key: 'name',
      label: 'Bien de Uso',
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
      sortValue: (row) => allAssets.filter((a) => a.fixedAssetId === row.id && a.status === 'activo').length,
      render: (v) => {
        const count = allAssets.filter((a) => a.fixedAssetId === v && a.status === 'activo').length
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
            onClick={(e) => { e.stopPropagation(); setModalFA(row) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Editar bien de uso"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar bien de uso"
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
        title="Bienes de Uso"
        subtitle="Catálogo patrimonial utilizado al imputar activos"
        actions={
          <button
            onClick={() => setModalFA(null)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Bien de Uso
          </button>
        }
      />

      <SimpleCrudManager
        kpis={[
          { label: 'Total', value: allFixedAssets.length, description: 'Bienes de uso registrados', icon: Boxes },
          { label: 'Activos', value: activeCount, description: 'Disponibles para imputación', icon: CheckCircle2, variant: 'success' },
          { label: 'Inactivos', value: inactiveCount, description: 'Sin movimiento activo', icon: XCircle, variant: inactiveCount > 0 ? 'warning' : 'default' },
        ]}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por código, nombre o descripción…"
        statusFilter={filterStatus}
        onStatusFilterChange={setFilterStatus}
        isLoading={isLoading}
        totalCount={allFixedAssets.length}
        filteredCount={filtered.length}
        entityLabelPlural="bienes"
        emptyTitle="Sin bienes de uso"
        emptyDescription="No se encontraron bienes con los filtros aplicados."
        columns={columns}
        data={filtered}
        rowKey="id"
        tableKey="fixed-assets"
        minWidth={640}
        deleteConfirm={{
          open: deleteId !== null,
          title: 'Eliminar bien de uso',
          description: `¿Eliminar "${allFixedAssets.find((fa) => fa.id === deleteId)?.name ?? 'este bien de uso'}"? Esta acción no se puede deshacer.`,
          onConfirm: () => deleteId && handleDelete(deleteId),
          onCancel: () => setDeleteId(null),
        }}
      />

      {modalFA !== undefined && (
        <FixedAssetModal
          fixedAsset={modalFA}
          onClose={() => setModalFA(undefined)}
          onSave={handleSave}
        />
      )}
    </PageContent>
  )
}
