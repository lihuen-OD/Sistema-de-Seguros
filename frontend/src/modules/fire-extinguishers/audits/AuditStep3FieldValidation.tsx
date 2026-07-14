import { useQuery } from '@tanstack/react-query'
import { ValidatedField, type FieldValidationState } from './ValidatedField'
import { catalogQueries } from '../../../shared/api/catalogs.api'
import type { FireExtinguisher } from '../../../shared/types'
import type { FireExtAuditMasterField } from '../../../shared/api/fire-extinguisher-audits.api'
import type { ChoiceOption } from '../../../shared/components/forms/ChoiceGroup'

export interface FieldValidationConfigItem {
  key: FireExtAuditMasterField
  label: string
  inputType: 'text' | 'date' | 'select'
  getCurrentValue: (fe: FireExtinguisher) => string
}

export const FIELD_VALIDATION_CONFIG: FieldValidationConfigItem[] = [
  { key: 'cylinderNumber', label: 'Número de cilindro', inputType: 'text', getCurrentValue: (fe) => fe.cylinderNumber ?? '' },
  { key: 'expirationDate', label: 'Fecha de vencimiento', inputType: 'date', getCurrentValue: (fe) => fe.expirationDate },
  { key: 'capacity', label: 'Capacidad', inputType: 'select', getCurrentValue: (fe) => fe.capacity },
  { key: 'type', label: 'Tipo de agente extintor', inputType: 'select', getCurrentValue: (fe) => fe.type },
  { key: 'brand', label: 'Marca', inputType: 'text', getCurrentValue: (fe) => fe.brand ?? '' },
]

interface AuditStep3FieldValidationProps {
  extinguisher: FireExtinguisher
  validations: Record<string, FieldValidationState>
  onChange: (next: Record<string, FieldValidationState>) => void
}

export function AuditStep3FieldValidation({ extinguisher, validations, onChange }: AuditStep3FieldValidationProps) {
  const { data: extTypes = [] } = useQuery(catalogQueries.byCategory('fire_ext_type'))
  const { data: extCapacities = [] } = useQuery(catalogQueries.byCategory('fire_ext_capacity'))

  const optionsByField: Partial<Record<FireExtAuditMasterField, ChoiceOption[]>> = {
    type: extTypes.map((t) => ({ value: t.label, label: t.label })),
    capacity: extCapacities.map((c) => ({ value: c.label, label: c.label })),
  }

  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">
        Revisá los datos maestros contra el equipo físico. Si coinciden, confirmalos; si no, proponé el valor correcto.
      </p>
      <div className="space-y-3">
        {FIELD_VALIDATION_CONFIG.map((field) => (
          <ValidatedField
            key={field.key}
            label={field.label}
            currentValue={field.getCurrentValue(extinguisher)}
            inputType={field.inputType}
            options={optionsByField[field.key]}
            state={validations[field.key]}
            onChange={(next) => onChange({ ...validations, [field.key]: next })}
          />
        ))}
      </div>
    </div>
  )
}
