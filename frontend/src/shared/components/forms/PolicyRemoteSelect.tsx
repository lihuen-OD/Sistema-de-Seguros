import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  policyQueries,
  type PolicySearchResult,
} from '../../api/policies.api'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

interface InitialPolicyOption {
  id: string
  policyNumber: string
  insuranceCompany: string
  endDate?: string
  insuranceTypeNames?: string[]
}

interface PolicyRemoteSelectProps {
  value: string
  onChange: (policyId: string, policy?: PolicySearchResult) => void
  initialOption?: InitialPolicyOption
  assetId?: string
  insuranceCompany?: string
  activeOnly?: boolean
  disabled?: boolean
  placeholder?: string
  emptyOptionLabel?: string
  noResultsMessage?: string
}

function toSelectOption(policy: PolicySearchResult): SearchableSelectOption {
  const types = policy.insuranceTypeNames.join(', ') || 'Sin tipo'
  return {
    value: policy.id,
    label: policy.policyNumber,
    sublabel: `${types} · ${policy.insuranceCompany}`,
    keywords: [policy.producerName, policy.startDate, policy.endDate, policy.status].filter(Boolean).join(' '),
  }
}

function toInitialSelectOption(policy?: InitialPolicyOption): SearchableSelectOption | undefined {
  if (!policy) return undefined
  const types = policy.insuranceTypeNames?.join(', ') || 'Sin tipo'
  return {
    value: policy.id,
    label: policy.policyNumber,
    sublabel: `${types} · ${policy.insuranceCompany}`,
  }
}

export function PolicyRemoteSelect({
  value,
  onChange,
  initialOption,
  assetId,
  insuranceCompany,
  activeOnly,
  disabled,
  placeholder = 'Sin póliza asociada',
  emptyOptionLabel = 'Sin póliza asociada',
  noResultsMessage = 'No se encontraron pólizas',
}: PolicyRemoteSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedOption, setSelectedOption] = useState<SearchableSelectOption | undefined>(() =>
    toInitialSelectOption(initialOption),
  )
  const { data: policies = [], isFetching } = useQuery({
    ...policyQueries.search({
      q: search || undefined,
      limit: 20,
      selectedId: value || undefined,
      assetId: assetId || undefined,
      insuranceCompany: insuranceCompany || undefined,
      activeOnly,
    }),
    // Consultar también con el panel cerrado cuando hay un valor permite
    // reconstruir el label de selecciones existentes fuera del primer lote.
    enabled: open || !!value,
  })

  const options = useMemo(() => {
    const remoteOptions = policies.map(toSelectOption)
    if (!value || remoteOptions.some((option) => option.value === value)) return remoteOptions
    return selectedOption?.value === value ? [selectedOption, ...remoteOptions] : remoteOptions
  }, [policies, selectedOption, value])

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={(policyId) => {
        const policy = policies.find((candidate) => candidate.id === policyId)
        const option = options.find((candidate) => candidate.value === policyId)
        setSelectedOption(option)
        onChange(policyId, policy)
      }}
      onSearchChange={setSearch}
      onOpenChange={setOpen}
      searchDebounceMs={300}
      loading={(open || !!value) && isFetching}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder="Buscar por número, aseguradora, productor, tipo o activo…"
      emptyOptionLabel={emptyOptionLabel}
      noResultsMessage={noResultsMessage}
    />
  )
}
