import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { producerQueries } from '../../api/producers.api'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

interface ProducerRemoteSelectProps {
  value: string
  onChange: (producerId: string) => void
  activeOnly?: boolean
  disabled?: boolean
  placeholder?: string
  emptyOptionLabel?: string
  noResultsMessage?: string
}

export function ProducerRemoteSelect({
  value,
  onChange,
  activeOnly,
  disabled,
  placeholder = 'Seleccionar productor…',
  emptyOptionLabel = 'Sin productor',
  noResultsMessage = 'No se encontraron productores',
}: ProducerRemoteSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: producers = [], isFetching } = useQuery({
    ...producerQueries.search({
      q: search || undefined,
      limit: 20,
      selectedId: value || undefined,
      activeOnly,
    }),
    // Con valor inicial también consulta cerrado para reconstruir el label de
    // una selección que no pertenezca al primer lote (o esté inactiva).
    enabled: open || !!value,
  })

  const options = useMemo<SearchableSelectOption[]>(() => producers.map((producer) => {
    const contact = [producer.registrationNumber, producer.email, producer.phone]
      .filter(Boolean)
      .join(' · ')
    return {
      value: producer.id,
      label: producer.name,
      sublabel: `${contact || 'Sin datos de contacto'}${producer.isActive ? '' : ' · Inactivo'}`,
    }
  }), [producers])

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
      searchPlaceholder="Buscar por nombre, matrícula, email o teléfono…"
      emptyOptionLabel={emptyOptionLabel}
      noResultsMessage={noResultsMessage}
    />
  )
}
