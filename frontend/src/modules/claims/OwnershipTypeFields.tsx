import { User, Users } from 'lucide-react'
import clsx from 'clsx'
import { FormField, FormInput } from '../../shared/components/forms/FormSection'
import type { ClaimOwnershipType } from '../../shared/types'

interface OwnershipTypeFieldsProps {
  ownershipType: ClaimOwnershipType | ''
  onOwnershipTypeChange: (value: ClaimOwnershipType) => void
  responsiblePersonName: string
  onResponsiblePersonNameChange: (value: string) => void
  thirdPartyInsuranceCompany: string
  onThirdPartyInsuranceCompanyChange: (value: string) => void
  thirdPartyContact: string
  onThirdPartyContactChange: (value: string) => void
  thirdPartyInsurerContact: string
  onThirdPartyInsurerContactChange: (value: string) => void
  errors?: {
    ownershipType?: string
    thirdPartyInsuranceCompany?: string
    thirdPartyContact?: string
    thirdPartyInsurerContact?: string
  }
}

const OPTIONS: { value: ClaimOwnershipType; label: string; description: string; Icon: typeof User }[] = [
  { value: 'propio', label: 'Propio', description: 'Un activo o persona de la empresa', Icon: User },
  { value: 'terceros', label: 'De Terceros', description: 'Involucra a otra persona o vehículo', Icon: Users },
]

export function OwnershipTypeFields({
  ownershipType,
  onOwnershipTypeChange,
  responsiblePersonName,
  onResponsiblePersonNameChange,
  thirdPartyInsuranceCompany,
  onThirdPartyInsuranceCompanyChange,
  thirdPartyContact,
  onThirdPartyContactChange,
  thirdPartyInsurerContact,
  onThirdPartyInsurerContactChange,
  errors,
}: OwnershipTypeFieldsProps) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value, label, description, Icon }) => {
          const isSelected = ownershipType === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => onOwnershipTypeChange(value)}
              className={clsx(
                'flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all',
                isSelected
                  ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <div className={clsx(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                isSelected ? 'bg-blue-100' : 'bg-slate-100',
              )}>
                <Icon size={14} className={isSelected ? 'text-blue-600' : 'text-slate-500'} />
              </div>
              <div>
                <p className={clsx('text-xs font-medium leading-tight', isSelected ? 'text-blue-700' : 'text-slate-700')}>
                  {label}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{description}</p>
              </div>
            </button>
          )
        })}
      </div>

      {errors?.ownershipType && (
        <p className="text-xs text-red-500 mt-2">{errors.ownershipType}</p>
      )}

      {ownershipType === 'propio' && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Nombre del responsable / conductor (opcional)">
            <FormInput
              type="text"
              value={responsiblePersonName}
              onChange={(e) => onResponsiblePersonNameChange(e.target.value)}
              placeholder="Ej: Ricardo Fernández"
            />
          </FormField>
        </div>
      )}

      {ownershipType === 'terceros' && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Aseguradora del tercero"
            required
            error={errors?.thirdPartyInsuranceCompany}
            fullWidth
          >
            <FormInput
              type="text"
              value={thirdPartyInsuranceCompany}
              onChange={(e) => onThirdPartyInsuranceCompanyChange(e.target.value)}
              placeholder="Ej: Provincia Seguros"
            />
          </FormField>
          <FormField label="Contacto del tercero" required error={errors?.thirdPartyContact}>
            <FormInput
              type="text"
              value={thirdPartyContact}
              onChange={(e) => onThirdPartyContactChange(e.target.value)}
              placeholder="Nombre y datos de contacto"
            />
          </FormField>
          <FormField
            label="Contacto de su aseguradora"
            required
            error={errors?.thirdPartyInsurerContact}
          >
            <FormInput
              type="text"
              value={thirdPartyInsurerContact}
              onChange={(e) => onThirdPartyInsurerContactChange(e.target.value)}
              placeholder="Nombre y datos de contacto"
            />
          </FormField>
        </div>
      )}
    </div>
  )
}
