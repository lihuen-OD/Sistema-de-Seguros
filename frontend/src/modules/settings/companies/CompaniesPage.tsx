import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, XCircle, Hash, Plus, Edit2, X, Save, Loader2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import {
  FormField,
  FormInput,
  FormSelect,
} from '../../../shared/components/forms/FormSection'
import { formatDate } from '../../../shared/utils/format'
import { companiesApi, companyQueries, companyKeys, type CompanyInput } from '../../../shared/api/companies.api'
import { assetQueries } from '../../../shared/api/assets.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import type { Company, TableColumn } from '../../../shared/types'

// ─── Modal ────────────────────────────────────────────────────────────────────

interface CompanyModalProps {
  company: Company | null
  onClose: () => void
  onSave: (input: CompanyInput) => Promise<void>
}

function CompanyModal({ company, onClose, onSave }: CompanyModalProps) {
  const isEdit = company !== null

  const [name, setName] = useState(company?.name ?? '')
  const [taxId, setTaxId] = useState(company?.taxId ?? '')
  const [status, setStatus] = useState<'activo' | 'inactivo'>(company?.status ?? 'activo')
  const [errors, setErrors] = useState<{ name?: string; taxId?: string }>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate(): boolean {
    const e: { name?: string; taxId?: string } = {}
    if (!name.trim()) e.name = 'La razón social es obligatoria'
    if (!taxId.trim()) e.taxId = 'El CUIT es obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      await onSave({ name, taxId, status })
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
              <Building2 size={15} className="text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                {isEdit ? 'Editar Empresa' : 'Nueva Empresa'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEdit ? company!.name : 'Completá los datos de la nueva empresa'}
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
          <FormField label="Razón Social" required error={errors.name} fullWidth>
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Agropecuaria Los Olivos S.A."
              autoFocus
            />
          </FormField>
          <FormField label="CUIT" required error={errors.taxId} fullWidth>
            <FormInput
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="Ej: 30-71234567-8"
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
              {isEdit ? 'Guardar Cambios' : 'Crear Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [modalCompany, setModalCompany] = useState<Company | null | undefined>(undefined)

  const queryClient = useQueryClient()

  const { data: allCompanies = [], isLoading: isLoadingCompanies, isError } = useQuery(companyQueries.list())

  const { data: allCostCenters = [] } = useQuery(costCenterQueries.list())

  const { data: allAssets = [] } = useQuery(assetQueries.list())

  const filtered = useMemo(() => {
    if (!search) return allCompanies
    const q = search.toLowerCase()
    return allCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.taxId.toLowerCase().includes(q),
    )
  }, [search, allCompanies])

  const activeCount = allCompanies.filter((c) => c.status === 'activo').length
  const inactiveCount = allCompanies.filter((c) => c.status === 'inactivo').length
  const totalCostCenters = allCostCenters.filter((cc) => cc.status === 'activo').length
  const totalAssets = allAssets.filter((a) => a.status === 'activo').length

  async function handleSave(input: CompanyInput) {
    if (modalCompany) {
      await companiesApi.update(modalCompany.id, input)
    } else {
      await companiesApi.create(input)
    }
    setModalCompany(undefined)
    queryClient.invalidateQueries({ queryKey: companyKeys.all })
  }

  const columns: TableColumn<Company>[] = [
    {
      key: 'name',
      label: 'Razón Social',
      render: (v, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-brand-500" />
          </div>
          <div>
            <span className="font-medium text-slate-800 text-sm block">{String(v)}</span>
            <span className="text-xs text-slate-400 font-mono">CUIT {row.taxId}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'id',
      label: 'Activos',
      render: (v) => {
        const ccCount = allAssets.filter((a) => a.companyId === v && a.status === 'activo').length
        return (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <Hash size={12} />
            {ccCount} activo{ccCount !== 1 ? 's' : ''}
          </span>
        )
      },
    },
    {
      key: 'createdAt',
      label: 'Alta',
      render: (v) => (
        <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setModalCompany(row) }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
          title="Editar empresa"
        >
          <Edit2 size={15} />
        </button>
      ),
      className: 'w-10',
    },
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Empresas"
        subtitle="Razones sociales que conforman el grupo económico"
        actions={
          <button
            onClick={() => setModalCompany(null)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva Empresa
          </button>
        }
      />

      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Empresas Activas"
          value={activeCount}
          description={`${allCompanies.length} total registradas`}
          icon={Building2}
          variant="default"
        />
        <KpiCard
          label="Inactivas"
          value={inactiveCount}
          description="Fuera de operación"
          icon={XCircle}
          variant={inactiveCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Centros de Costo"
          value={totalCostCenters}
          description="Activos en todas las empresas"
          icon={Hash}
          variant="info"
        />
        <KpiCard
          label="Activos Asociados"
          value={totalAssets}
          description="Bienes en estado activo"
          icon={CheckCircle2}
          variant="success"
        />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por razón social o CUIT…"
            className="w-full sm:w-72"
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {isLoadingCompanies ? 'Cargando…' : `${filtered.length} de ${allCompanies.length} empresas`}
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          emptyTitle="Sin empresas"
          emptyDescription="No se encontraron empresas con los filtros aplicados."
        />
      </SectionCard>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {allCompanies.map((company) => {
          const assetList = allAssets.filter((a) => a.companyId === company.id && a.status === 'activo')
          return (
            <div
              key={company.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => setModalCompany(company)}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} className="text-brand-500" />
                </div>
                <StatusPill status={company.status} size="sm" />
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1 leading-snug">{company.name}</h3>
              <p className="text-xs text-slate-400 font-mono mb-4">CUIT {company.taxId}</p>
              <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                <div className="text-center">
                  <span className="block text-lg font-bold text-slate-800">{assetList.length}</span>
                  <span className="block text-xs text-slate-400">Activos</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {modalCompany !== undefined && (
        <CompanyModal
          company={modalCompany}
          onClose={() => setModalCompany(undefined)}
          onSave={handleSave}
        />
      )}
    </PageContent>
  )
}
