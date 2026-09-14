import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetQueries, type AssetSearchResult } from '../../../shared/api/assets.api'
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '../../../shared/components/forms/SearchableSelect'

interface InitialAssetOption {
  id: string
  name: string
  code: string | null
  status?: string
}

interface PolicyAssetRemoteSelectProps {
  value: string
  usedAssetIds: Set<string>
  onChange: (assetId: string, assetName?: string) => void
  initialOption?: InitialAssetOption
  disabled?: boolean
}

function toSelectOption(asset: AssetSearchResult): SearchableSelectOption {
  return {
    value: asset.id,
    label: asset.name,
    sublabel: `${asset.code ?? `ACT-${asset.id.slice(0, 8).toUpperCase()}`}${asset.status === 'vendido' ? ' · Vendido' : ''}`,
    keywords: [asset.plate, asset.assetType, asset.fixedAssetCode, asset.fixedAssetName].filter(Boolean).join(' '),
  }
}

function toInitialSelectOption(asset?: InitialAssetOption): SearchableSelectOption | undefined {
  if (!asset) return undefined
  return {
    value: asset.id,
    label: asset.name,
    sublabel: `${asset.code ?? `ACT-${asset.id.slice(0, 8).toUpperCase()}`}${asset.status === 'vendido' ? ' · Vendido' : ''}`,
  }
}

export function PolicyAssetRemoteSelect({
  value,
  usedAssetIds,
  onChange,
  initialOption,
  disabled,
}: PolicyAssetRemoteSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedOption, setSelectedOption] = useState<SearchableSelectOption | undefined>(() =>
    toInitialSelectOption(initialOption),
  )
  const { data: assets = [], isFetching } = useQuery({
    ...assetQueries.search({ q: search || undefined, limit: 20, selectedId: value || undefined }),
    enabled: open,
  })

  const options = useMemo(() => {
    const remoteOptions = assets
      .filter((asset) => asset.id === value || !usedAssetIds.has(asset.id))
      .map(toSelectOption)
    if (!value || remoteOptions.some((option) => option.value === value)) return remoteOptions
    if (selectedOption?.value === value) {
      return [selectedOption, ...remoteOptions]
    }
    return remoteOptions
  }, [assets, selectedOption, usedAssetIds, value])

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={(assetId) => {
        const option = options.find((candidate) => candidate.value === assetId)
        setSelectedOption(option)
        onChange(assetId, option?.label)
      }}
      onSearchChange={setSearch}
      onOpenChange={setOpen}
      loading={open && isFetching}
      disabled={disabled}
      placeholder="Seleccionar activo…"
      searchPlaceholder="Buscar por nombre, código, patente, serie, chasis, motor o bien de uso…"
      noResultsMessage="No se encontraron activos activos o vendidos"
    />
  )
}
