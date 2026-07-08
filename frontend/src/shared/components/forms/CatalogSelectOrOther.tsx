import { useEffect, useState } from 'react'
import { FormField, FormInput, FormSelect } from './FormSection'

const OTHER_SENTINEL = '__OTHER__'

interface CatalogSelectOrOtherProps {
  label: string
  required?: boolean
  error?: string
  options: string[]
  value: string
  onChange: (value: string) => void
  otherLabel?: string
  selectPlaceholder?: string
  otherPlaceholder?: string
}

// Select alimentado por catálogo con una opción "Otros" que revela un input de
// texto libre. También cubre valores legacy que no matchean ningún ítem del
// catálogo actual: caen en modo "Otros" con el valor existente precargado,
// en vez de perderse silenciosamente.
export function CatalogSelectOrOther({
  label,
  required,
  error,
  options,
  value,
  onChange,
  otherLabel = 'Otros',
  selectPlaceholder = 'Seleccionar…',
  otherPlaceholder = 'Escribir…',
}: CatalogSelectOrOtherProps) {
  const [showOther, setShowOther] = useState(() => value !== '' && !options.includes(value))

  // Los formularios de edición cargan `value` de forma asíncrona después del
  // montaje (patrón "seeded" de New/EditPage) — sin este efecto, un valor
  // legacy que llega tarde (ej. una marca que no está en el catálogo actual)
  // quedaría en modo select sin match visible, en vez de caer a "Otros".
  useEffect(() => {
    if (value === '') return
    setShowOther(!options.includes(value))
  }, [value, options])

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === OTHER_SENTINEL) {
      setShowOther(true)
      onChange('')
    } else {
      setShowOther(false)
      onChange(next)
    }
  }

  return (
    <>
      <FormField label={label} required={required} error={!showOther ? error : undefined}>
        <FormSelect value={showOther ? OTHER_SENTINEL : value} onChange={handleSelectChange}>
          <option value="">{selectPlaceholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value={OTHER_SENTINEL}>{otherLabel}</option>
        </FormSelect>
      </FormField>
      {showOther && (
        <FormField label={`${label} (especificar)`} required={required} error={error}>
          <FormInput
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={otherPlaceholder}
            autoFocus
          />
        </FormField>
      )}
    </>
  )
}
