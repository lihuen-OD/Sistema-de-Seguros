import { MapPin } from 'lucide-react'
import { ChoiceGroup } from '../../../shared/components/forms/ChoiceGroup'
import { FormField, FormInput } from '../../../shared/components/forms/FormSection'
import type { FireExtinguisher } from '../../../shared/types'

interface AuditStep2LocationProps {
  extinguisher: FireExtinguisher
  locationConfirmed: boolean | null
  proposedLocation: string
  reason: string
  onChange: (next: { locationConfirmed: boolean | null; proposedLocation: string; reason: string }) => void
}

export function AuditStep2Location({
  extinguisher,
  locationConfirmed,
  proposedLocation,
  reason,
  onChange,
}: AuditStep2LocationProps) {
  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">Confirmá si el matafuego se encuentra en la ubicación registrada.</p>

      <div className="border border-slate-200 rounded-lg p-4 mb-5 bg-slate-50">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
          <MapPin size={13} />
          Ubicación registrada
        </div>
        <p className="text-sm font-semibold text-slate-800">
          {extinguisher.establishment ?? '—'}
          {extinguisher.location ? ` · ${extinguisher.location}` : ''}
        </p>
      </div>

      <FormField label="¿La ubicación es correcta?" required>
        <ChoiceGroup
          options={[
            { value: 'SI', label: 'Sí, es correcta' },
            { value: 'NO', label: 'No, hay que corregirla' },
          ]}
          value={locationConfirmed === null ? '' : locationConfirmed ? 'SI' : 'NO'}
          onChange={(v) => onChange({ locationConfirmed: v === 'SI', proposedLocation, reason })}
        />
      </FormField>

      {locationConfirmed === false && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Ubicación correcta" required>
            <FormInput
              type="text"
              value={proposedLocation}
              onChange={(e) => onChange({ locationConfirmed, proposedLocation: e.target.value, reason })}
              placeholder="Ej: PLANTA · Pasillo 2"
            />
          </FormField>
          <FormField label="Motivo (opcional)">
            <FormInput
              type="text"
              value={reason}
              onChange={(e) => onChange({ locationConfirmed, proposedLocation, reason: e.target.value })}
              placeholder="Ej: se trasladó al depósito nuevo"
            />
          </FormField>
        </div>
      )}
    </div>
  )
}
