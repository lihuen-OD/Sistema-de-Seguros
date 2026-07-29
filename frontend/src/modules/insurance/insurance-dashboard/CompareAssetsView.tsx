import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { ChartCard } from '../../../shared/components/cards/ChartCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { formatCurrencyCompact } from '../../../shared/utils/format'
import type { TableColumn } from '../../../shared/types'
import type { AssetInsuranceSummary } from '../../../shared/utils/insuranceDashboardCalc'

interface CompareAssetsViewProps {
  summaries: AssetInsuranceSummary[]
}

function pct(v: number | null, digits = 1): string {
  return v == null ? '—' : `${v.toFixed(digits)}%`
}

function coverageColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 85) return 'text-emerald-600'
  if (v >= 70) return 'text-amber-600'
  return 'text-red-600'
}

export function CompareAssetsView({ summaries }: CompareAssetsViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilters, setTypeFilters] = useState<string[]>([])

  const typeOptions = useMemo(() => {
    const distinct = [...new Set(summaries.map((s) => s.assetType))].sort((a, b) => a.localeCompare(b, 'es'))
    return distinct.map((t) => ({ value: t, label: t }))
  }, [summaries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return summaries.filter((s) => {
      const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      const matchesType = typeFilters.length === 0 || typeFilters.includes(s.assetType)
      return matchesSearch && matchesType
    })
  }, [summaries, search, typeFilters])

  const selected = useMemo(
    () => summaries.filter((s) => selectedIds.has(s.assetId)).sort((a, b) => (b.primaPctValor ?? 0) - (a.primaPctValor ?? 0)),
    [summaries, selectedIds],
  )

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const s of filtered) {
        if (checked) next.add(s.assetId)
        else next.delete(s.assetId)
      }
      return next
    })
  }

  function remove(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const columns: TableColumn<AssetInsuranceSummary>[] = [
    {
      id: 'name',
      key: 'name',
      label: 'Activo',
      sortable: true,
      render: (_, row) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate">{row.name}</p>
          <p className="text-xs text-slate-400 font-mono">{row.code}</p>
        </div>
      ),
    },
    { id: 'assetType', key: 'assetType', label: 'Categoría', sortable: true, className: 'text-slate-500' },
    {
      id: 'valorRealUsd', key: 'valorRealUsd', label: 'Valor real', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => (v == null ? '—' : formatCurrencyCompact(v as number, 'USD')),
    },
    {
      id: 'valorNuevoUsd', key: 'valorNuevoUsd', label: 'Valor a nuevo', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => (v == null ? '—' : formatCurrencyCompact(v as number, 'USD')),
    },
    {
      id: 'sumaAseguradaUsd', key: 'sumaAseguradaUsd', label: 'Suma asegurada', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => formatCurrencyCompact(v as number, 'USD'),
    },
    {
      id: 'coveragePct', key: 'coveragePct', label: '% Cobertura', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums font-semibold',
      render: (v, row) => <span className={coverageColor(row.coveragePct)}>{pct(v as number | null)}</span>,
    },
    {
      id: 'primaPctValor', key: 'primaPctValor', label: 'Prima / valor', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => pct(v as number | null, 2),
    },
    {
      id: 'facturado12mUsd', key: 'facturado12mUsd', label: 'Facturado (12m)', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => formatCurrencyCompact(v as number, 'USD'),
    },
    {
      id: 'claimsCount', key: 'claimsCount', label: 'Siniestros', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
    },
    {
      id: 'claimsCostUsd', key: 'claimsCostUsd', label: 'Costo siniestros', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => formatCurrencyCompact(v as number, 'USD'),
    },
    {
      id: 'nextExpiration', key: 'nextExpiration', label: 'Próx. vencimiento', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      sortValue: (row) => row.nextExpiration?.daysUntil ?? Number.POSITIVE_INFINITY,
      render: (_, row) => (row.nextExpiration ? `${row.nextExpiration.daysUntil} días` : 'Sin pólizas activas'),
    },
  ]

  const maxPrima = Math.max(...selected.map((s) => s.primaPctValor ?? 0), 1)

  return (
    <div className="space-y-5">
      <SectionCard
        title="Elegí qué activos comparar"
        subtitle="Buscá, filtrá por tipo y tildá los que quieras comparar — sin límite de cantidad"
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o código…" className="flex-1 min-w-[220px]" />
          <MultiSelectFilter label="Tipo de activo" options={typeOptions} value={typeFilters} onChange={setTypeFilters} />
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 mr-1">Comparando {selected.length}:</span>
            {selected.map((s) => (
              <span key={s.assetId} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                {s.name}
                <button type="button" onClick={() => remove(s.assetId)} className="text-brand-400 hover:text-brand-700 transition-colors">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <DataTable
          columns={columns}
          data={filtered}
          rowKey="assetId"
          selectable
          selectedIds={selectedIds}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
          emptyTitle="Sin resultados"
          emptyDescription="Ningún activo coincide con la búsqueda o el filtro aplicado."
        />
      </SectionCard>

      {selected.length > 0 && (
        <ChartCard
          title="Prima como % del valor del activo"
          subtitle="Normaliza por valor — así se compara un tractor con una camioneta sin que el tamaño distorsione la lectura"
          height={Math.max(140, 44 * selected.length + 20)}
        >
          <div className="h-full overflow-y-auto pr-1 space-y-2.5">
            {selected.map((s) => {
              const v = s.primaPctValor ?? 0
              return (
                <div key={s.assetId} className="grid grid-cols-[160px_1fr_70px] items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 truncate">{s.name}</span>
                  <span className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(v / maxPrima) * 100}%` }} />
                  </span>
                  <span className="text-xs font-bold text-slate-700 text-right tabular-nums">{pct(s.primaPctValor, 2)}</span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      )}
    </div>
  )
}
