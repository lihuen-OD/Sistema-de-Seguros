import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetQueries } from '../../api/assets.api'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

interface AssetRemoteSelectProps {
  value: string
  onChange: (assetId: string) => void
  disabled?: boolean
  placeholder?: string
  emptyOptionLabel?: string
  noResultsMessage?: string
}

// Selector remoto genérico de activos, vía GET /assets/search (Fase 1B.1) —
// a diferencia de PolicyAssetRemoteSelect (acoplado a la lógica de
// "activos ya usados en otra línea de cobertura" de los formularios de
// póliza), este no excluye nada: sirve para elegir cualquier activo del
// sistema, como en Nueva/Editar Tarea.
export function AssetRemoteSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Seleccionar activo…',
  emptyOptionLabel = 'Sin activo',
  noResultsMessage = 'No se encontraron activos',
}: AssetRemoteSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: assets = [], isFetching } = useQuery({
    ...assetQueries.search({ q: search || undefined, limit: 20, selectedId: value || undefined }),
    enabled: open || !!value,
  })

  const options = useMemo<SearchableSelectOption[]>(() => assets.map((asset) => ({
    value: asset.id,
    label: asset.name,
    sublabel: `${asset.code ?? `ACT-${asset.id.slice(0, 8).toUpperCase()}`}${asset.status === 'vendido' ? ' · Vendido' : ''}`,
  })), [assets])

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      onSearchChange={setSearch}
      onOpenChange={setOpen}
      searchDebounceMs={300}
      loading={open && isFetching}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder="Buscar por nombre, código o patente…"
      emptyOptionLabel={emptyOptionLabel}
      noResultsMessage={noResultsMessage}
    />
  )
}
