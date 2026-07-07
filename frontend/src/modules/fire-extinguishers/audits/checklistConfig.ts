import type { ChoiceOption } from '../../../shared/components/forms/ChoiceGroup'
import type { AuditChecklistInput } from '../../../shared/api/fire-extinguisher-audits.api'

// ── Opciones (valores reales del contrato — ver fire-extinguisher-audits.constants.ts en backend) ──

export const CLEANLINESS_OPTIONS: ChoiceOption[] = [
  { value: 'IMPECABLE', label: 'Impecable' },
  { value: 'LEVE_POLVO', label: 'Polvo leve' },
  { value: 'SUCIEDAD_VISIBLE', label: 'Suciedad visible' },
  { value: 'MUY_SUCIO', label: 'Muy sucio' },
  { value: 'SUCIEDAD_ACUMULADA', label: 'Suciedad acumulada' },
]

export const CHARGE_FILL_STATUS_OPTIONS: ChoiceOption[] = [
  { value: 'CARGADO', label: 'Cargado' },
  { value: 'DESCARGADO', label: 'Descargado' },
]

export const YES_NO_OPTIONS: ChoiceOption[] = [
  { value: 'SI', label: 'Sí' },
  { value: 'NO', label: 'No' },
]

export const PLATE_CONDITION_OPTIONS: ChoiceOption[] = [
  { value: 'SANA', label: 'Sana' },
  { value: 'ROTA_LEVE', label: 'Rota (leve)' },
  { value: 'ROTA_REQUIERE_CAMBIO', label: 'Rota (requiere cambio)' },
]

export const PRESSURE_STATUS_OPTIONS: ChoiceOption[] = [
  { value: 'BIEN', label: 'Bien' },
  { value: 'BAJA', label: 'Baja' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'NO_APLICA', label: 'No aplica' },
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
  { value: 'EN_MAL_ESTADO', label: 'En mal estado' },
]

export type ChecklistFieldKey = keyof AuditChecklistInput

export type ChecklistFieldType = 'choice' | 'date' | 'text'

export interface ChecklistFieldConfig {
  key: ChecklistFieldKey
  label: string
  type: ChecklistFieldType
  options?: ChoiceOption[]
  /** Si es false, el campo puede quedar vacío (observaciones de referencia, no bloquean el envío). */
  required: boolean
  /** Si se define, el campo solo se muestra (y solo es obligatorio) cuando devuelve true. */
  showIf?: (checklist: Record<string, string>) => boolean
}

export const CHECKLIST_FIELDS: ChecklistFieldConfig[] = [
  { key: 'cleanliness', label: 'Limpieza general', type: 'choice', options: CLEANLINESS_OPTIONS, required: true },
  { key: 'chargeFillStatus', label: 'Estado de carga', type: 'choice', options: CHARGE_FILL_STATUS_OPTIONS, required: true },
  { key: 'beaconPlateExists', label: '¿Cuenta con chapa baliza?', type: 'choice', options: YES_NO_OPTIONS, required: true },
  {
    key: 'beaconPlateCondition',
    label: 'Estado de la chapa baliza',
    type: 'choice',
    options: PLATE_CONDITION_OPTIONS,
    required: true,
    showIf: (c) => c.beaconPlateExists === 'SI',
  },
  {
    key: 'beaconPlateMatchesType',
    label: '¿La chapa corresponde al tipo de matafuego?',
    type: 'choice',
    options: YES_NO_OPTIONS,
    required: true,
    showIf: (c) => c.beaconPlateExists === 'SI',
  },
  { key: 'isObstructed', label: '¿Está obstruido?', type: 'choice', options: YES_NO_OPTIONS, required: true },
  { key: 'pressureStatus', label: 'Estado de presión', type: 'choice', options: PRESSURE_STATUS_OPTIONS, required: true },
  { key: 'sealStatus', label: 'Precinto', type: 'choice', options: HAS_STATUS_OPTIONS, required: true },
  { key: 'ringStatus', label: 'Anillo de seguridad', type: 'choice', options: HAS_STATUS_OPTIONS, required: true },
  { key: 'safetyPinStatus', label: 'Traba / seguro', type: 'choice', options: YES_NO_OPTIONS, required: true },
  { key: 'hoseNozzleCondition', label: 'Manguera y tobera', type: 'choice', options: HOSE_NOZZLE_CONDITION_OPTIONS, required: true },
  { key: 'chargeExpirationDateObserved', label: 'Vencimiento de carga observado', type: 'date', required: false },
  { key: 'hydraulicTestExpirationDateObserved', label: 'Vencimiento de prueba hidráulica observado', type: 'date', required: false },
  { key: 'cylinderNumberObserved', label: 'N° de cilindro observado', type: 'text', required: false },
  { key: 'capacityObserved', label: 'Capacidad observada', type: 'text', required: false },
  { key: 'extinguishingAgentObserved', label: 'Agente extintor observado', type: 'text', required: false },
  { key: 'brandObserved', label: 'Marca observada', type: 'text', required: false },
]

export function isChecklistComplete(checklist: Record<string, string>): boolean {
  return CHECKLIST_FIELDS.every((field) => {
    if (!field.required) return true
    if (field.showIf && !field.showIf(checklist)) return true
    return Boolean(checklist[field.key])
  })
}

export function optionLabel(options: ChoiceOption[] | undefined, value: string | undefined): string {
  if (!value) return '—'
  return options?.find((o) => o.value === value)?.label ?? value
}
