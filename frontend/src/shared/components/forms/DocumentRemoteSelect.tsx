import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  documentQueries,
  type DocumentSearchResult,
  type DocumentSearchParams,
} from '../../api/documents.api'
import { formatCurrencyFull, formatDate } from '../../utils/format'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

interface DocumentRemoteSelectProps {
  value: string
  onChange: (documentId: string, document?: DocumentSearchResult) => void
  type?: DocumentSearchParams['type']
  excludeCancelled?: boolean
  insuranceCompany?: string
  policyId?: string
  withAvailableBalance?: boolean
  minAvailableBalance?: number
  disabled?: boolean
  placeholder?: string
  emptyOptionLabel?: string
  noResultsMessage?: string
}

function toSelectOption(doc: DocumentSearchResult): SearchableSelectOption {
  // Con availableBalance (Nota de Crédito) el dato accionable es el saldo
  // disponible, no el importe original de la factura — se muestra ese en su
  // lugar en vez de sumar un cuarto dato al sublabel.
  const amountLabel = doc.availableBalance !== undefined
    ? `Saldo disponible: ${formatCurrencyFull(doc.availableBalance, doc.currency)}`
    : formatCurrencyFull(doc.totalAmount, doc.currency)
  const sublabel = [doc.insuranceCompany, formatDate(doc.issueDate), amountLabel].filter(Boolean).join(' · ')
  return { value: doc.id, label: doc.documentNumber, sublabel }
}

// Selector remoto de "documento vinculado" — Fase 1B.4. A diferencia de
// DocumentRelationSelector (que recibe la lista ya filtrada por el
// formulario y sigue en uso en NC/Endoso/Ajuste), este resuelve la búsqueda
// server-side vía GET /documents/search, liviano y paginado, en vez de
// filtrar sobre el findAll(limit 200). Se crea al lado del selector
// existente a propósito — cada formulario migra cuando le toca su subfase,
// no los 4 juntos (ver auditoría Fase 1B.4).
export function DocumentRemoteSelect({
  value,
  onChange,
  type,
  excludeCancelled,
  insuranceCompany,
  policyId,
  withAvailableBalance,
  minAvailableBalance,
  disabled,
  placeholder = 'Seleccionar documento…',
  emptyOptionLabel = 'Seleccionar documento…',
  noResultsMessage = 'No se encontraron documentos',
}: DocumentRemoteSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedOption, setSelectedOption] = useState<SearchableSelectOption | undefined>(undefined)
  const { data: documents = [], isFetching } = useQuery({
    ...documentQueries.search({
      q: search || undefined,
      limit: 20,
      selectedId: value || undefined,
      type,
      excludeCancelled,
      insuranceCompany,
      policyId,
      withAvailableBalance,
      minAvailableBalance,
    }),
    // Con valor inicial también consulta cerrado, para reconstruir el label
    // de una selección que no pertenezca al primer lote (mismo patrón que
    // ProducerRemoteSelect/PolicyRemoteSelect).
    enabled: open || !!value,
  })

  const options = useMemo(() => {
    const remoteOptions = documents.map(toSelectOption)
    if (!value || remoteOptions.some((option) => option.value === value)) return remoteOptions
    return selectedOption?.value === value ? [selectedOption, ...remoteOptions] : remoteOptions
  }, [documents, selectedOption, value])

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={(documentId) => {
        const document = documents.find((candidate) => candidate.id === documentId)
        const option = options.find((candidate) => candidate.value === documentId)
        setSelectedOption(option)
        onChange(documentId, document)
      }}
      onSearchChange={setSearch}
      onOpenChange={setOpen}
      searchDebounceMs={300}
      loading={(open || !!value) && isFetching}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder="Buscar por número o aseguradora…"
      emptyOptionLabel={emptyOptionLabel}
      noResultsMessage={noResultsMessage}
    />
  )
}
