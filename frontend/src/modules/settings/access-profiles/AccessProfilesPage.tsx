import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, Edit2, Trash2, CheckCircle2, XCircle, X, Save, Loader2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { CheckboxGroup } from '../../../shared/components/forms/CheckboxGroup'
import { FormField, FormInput, FormSelect } from '../../../shared/components/forms/FormSection'
import {
  accessProfilesApi,
  accessProfileQueries,
  accessProfileKeys,
  type AccessProfile,
  type AccessProfileInput,
} from '../../../shared/api/access-profiles.api'
import { MODULE_GROUPS, MODULE_LABELS, type ModuleKey, type TableColumn } from '../../../shared/types'

const CHECKBOX_SECTIONS = MODULE_GROUPS.map((group) => ({
  label: group.label,
  options: group.modules.map((m) => ({ value: m, label: MODULE_LABELS[m] })),
}))

const TOTAL_MODULES = MODULE_GROUPS.reduce((sum, g) => sum + g.modules.length, 0)

// ─── Modal ────────────────────────────────────────────────────────────────────

interface AccessProfileModalProps {
  profile: AccessProfile | null
  onClose: () => void
  onSave: (input: AccessProfileInput) => Promise<void>
}

function AccessProfileModal({ profile, onClose, onSave }: AccessProfileModalProps) {
  const isEdit = profile !== null

  const [name, setName] = useState(profile?.name ?? '')
  const [modules, setModules] = useState<ModuleKey[]>(profile?.modules ?? [])
  const [status, setStatus] = useState<'activo' | 'inactivo'>(
    profile ? (profile.isActive ? 'activo' : 'inactivo') : 'activo',
  )
  const [errors, setErrors] = useState<{ name?: string }>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate(): boolean {
    const e: { name?: string } = {}
    if (!name.trim()) e.name = 'El nombre es obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      await onSave({ name, modules, isActive: status === 'activo' })
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <KeyRound size={15} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                {isEdit ? 'Editar Perfil de Acceso' : 'Nuevo Perfil de Acceso'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Elegí qué pantallas puede usar cualquier usuario con este perfil
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nombre" required error={errors.name}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Seguros"
                autoFocus
              />
            </FormField>
            <FormField label="Estado">
              <FormSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as 'activo' | 'inactivo')}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </FormSelect>
            </FormField>
          </div>

          <FormField label={`Módulos habilitados (${modules.length} de ${TOTAL_MODULES})`} fullWidth>
            <div className="border border-slate-200 rounded-lg p-3">
              <CheckboxGroup sections={CHECKBOX_SECTIONS} value={modules} onChange={(v) => setModules(v as ModuleKey[])} />
            </div>
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
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Guardar Cambios' : 'Crear Perfil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccessProfilesPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalProfile, setModalProfile] = useState<AccessProfile | null | undefined>(undefined)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: allProfiles = [], isLoading } = useQuery(accessProfileQueries.list())

  const filtered = useMemo(() => {
    return allProfiles.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !filterStatus || (filterStatus === 'activo' ? p.isActive : !p.isActive)
      return matchSearch && matchStatus
    })
  }, [search, filterStatus, allProfiles])

  const activeCount = allProfiles.filter((p) => p.isActive).length
  const inactiveCount = allProfiles.filter((p) => !p.isActive).length

  const STATUS_OPTIONS = [
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' },
  ]

  async function handleSave(input: AccessProfileInput) {
    if (modalProfile) {
      await accessProfilesApi.update(modalProfile.id, input)
    } else {
      await accessProfilesApi.create(input)
    }
    setModalProfile(undefined)
    queryClient.invalidateQueries({ queryKey: accessProfileKeys.all })
  }

  async function handleDelete(id: string) {
    await accessProfilesApi.remove(id)
    queryClient.invalidateQueries({ queryKey: accessProfileKeys.all })
    setDeleteId(null)
  }

  const columns: TableColumn<AccessProfile>[] = [
    {
      key: 'name',
      label: 'Perfil',
      render: (v) => <span className="font-medium text-slate-800 text-sm">{String(v)}</span>,
    },
    {
      key: 'modules',
      label: 'Módulos',
      render: (v) => {
        const mods = v as ModuleKey[]
        return (
          <span className="text-xs text-slate-500">
            {mods.length} de {TOTAL_MODULES}
          </span>
        )
      },
    },
    {
      key: 'isActive',
      label: 'Estado',
      render: (v) => <StatusPill status={v ? 'activo' : 'inactivo'} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setModalProfile(row) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Editar perfil"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar perfil"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      className: 'w-20',
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title="Perfiles de Acceso"
        subtitle="Definí qué módulos puede usar cada perfil — luego asignalo a un usuario desde Usuarios"
        actions={
          <button
            onClick={() => setModalProfile(null)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Perfil
          </button>
        }
      />

      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label="Total"
          value={allProfiles.length}
          description="Perfiles de acceso registrados"
          icon={KeyRound}
          variant="default"
        />
        <KpiCard
          label="Activos"
          value={activeCount}
          description="Disponibles para asignar"
          icon={CheckCircle2}
          variant="success"
        />
        <KpiCard
          label="Inactivos"
          value={inactiveCount}
          description="Sin uso actual"
          icon={XCircle}
          variant={inactiveCount > 0 ? 'warning' : 'default'}
        />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre…"
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
            {isLoading ? 'Cargando…' : `${filtered.length} de ${allProfiles.length} perfiles`}
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          emptyTitle="Sin perfiles de acceso"
          emptyDescription="No se encontraron perfiles con los filtros aplicados."
          minWidth={560}
        />
      </SectionCard>

      {modalProfile !== undefined && (
        <AccessProfileModal
          profile={modalProfile}
          onClose={() => setModalProfile(undefined)}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar perfil de acceso"
        description={`¿Eliminar "${allProfiles.find((p) => p.id === deleteId)?.name ?? 'este perfil'}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
