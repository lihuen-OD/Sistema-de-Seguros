import type { ChoiceOption } from '../../../shared/components/forms/ChoiceGroup'
import type { AuditChecklistInput } from '../../../shared/api/fire-extinguisher-audits.api'

// ── Opciones (valores reales del contrato — ver fire-extinguisher-audits.constants.ts en backend) ──

export const CLEANLINESS_OPTIONS: ChoiceOption[] = [
  { value: 'IMPECABLE', label: 'Impecable' },
  { value: 'LEVE_POLVO', label: 'Polvo leve' },
  { value: 'SUCIEDAD_VISIBLE', label: 'Suciedad visible' },
  { value: 'MUY_SUCIO', label: 'Muy sucio' },
  { value: 'SUCIEDAD_ACUMULADA', label: 'Suciedad acumulada con el tiempo' },
]

export const CHARGE_FILL_STATUS_OPTIONS: ChoiceOption[] = [
  { value: 'CARGADO', label: 'Cargado' },
  { value: 'DESCARGADO', label: 'Descargado' },
]

export const PLATE_CONDITION_OPTIONS: ChoiceOption[] = [
  { value: 'SANA', label: 'Sana' },
  { value: 'ROTA_LEVE', label: 'Rota (leve)' },
  { value: 'ROTA_REQUIERE_CAMBIO', label: 'Rota (requiere cambio)' },
  { value: 'NO_TIENE', label: 'No tiene' },
]

export const HAS_STATUS_OPTIONS: ChoiceOption[] = [
  { value: 'TIENE', label: 'Tiene' },
  { value: 'NO_TIENE', label: 'No tiene' },
]

export const HOSE_NOZZLE_CONDITION_OPTIONS: ChoiceOption[] = [
  { value: 'SANA', label: 'Sana' },
  { value: 'ROTA_LEVE', label: 'Rota (leve)' },
  { value: 'ROTA_REQUIERE_CAMBIO', label: 'Rota (requiere cambio)' },
  { value: 'NO_TIENE', label: 'No tiene' },
]

export type ChecklistFieldKey = keyof AuditChecklistInput

export type ChecklistFieldType = 'choice' | 'date' | 'text'

export interface ChecklistFieldConfig {
  key: ChecklistFieldKey
  label: string
  type: ChecklistFieldType
  options?: ChoiceOption[]
  required: boolean
}

export const CHECKLIST_FIELDS: ChecklistFieldConfig[] = [
  { key: 'cleanliness', label: 'Limpieza', type: 'choice', options: CLEANLINESS_OPTIONS, required: true },
  { key: 'chargeFillStatus', label: 'Carga', type: 'choice', options: CHARGE_FILL_STATUS_OPTIONS, required: true },
  { key: 'beaconPlateCondition', label: 'Chapa Baliza', type: 'choice', options: PLATE_CONDITION_OPTIONS, required: true },
  { key: 'sealStatus', label: 'Precinto', type: 'choice', options: HAS_STATUS_OPTIONS, required: true },
  { key: 'ringStatus', label: 'Anillo', type: 'choice', options: HAS_STATUS_OPTIONS, required: true },
  { key: 'hoseNozzleCondition', label: 'Manguera y Tobera', type: 'choice', options: HOSE_NOZZLE_CONDITION_OPTIONS, required: true },
  { key: 'chargeExpirationDateObserved', label: 'Fecha de vencimiento de la carga', type: 'date', required: true },
]

export function isChecklistComplete(checklist: Record<string, string>): boolean {
  return CHECKLIST_FIELDS.every((field) => {
    if (!field.required) return true
    return Boolean(checklist[field.key])
  })
}

export function optionLabel(options: ChoiceOption[] | undefined, value: string | undefined): string {
  if (!value) return '—'
  return options?.find((o) => o.value === value)?.label ?? value
}
