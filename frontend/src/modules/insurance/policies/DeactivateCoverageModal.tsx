import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { FormField, FormInput, FormTextarea } from '../../../shared/components/forms/FormSection'
import { policiesApi, policyKeys } from '../../../shared/api/policies.api'
import type { PolicyCoverage } from '../../../shared/types'

const today = () => new Date().toISOString().slice(0, 10)

interface DeactivateCoverageModalProps {
  policyId: string
  policyEndDate: string
  coverage: PolicyCoverage
  onClose: () => void
  onSuccess: (updated: PolicyCoverage) => void
}

// Modal compartido para dar de baja una línea de cobertura — usado tanto
// desde el detalle de póliza como desde la edición, para no duplicar el
// mismo formulario/mutación en los dos lugares.
export function DeactivateCoverageModal({
  policyId, policyEndDate, coverage, onClose, onSuccess,
}: DeactivateCoverageModalProps) {
  const queryClient = useQueryClient()
  const [bajaDate, setBajaDate] = useState(today())
  const [bajaReason, setBajaReason] = useState('')
  const [errors, setErrors] = useState<{ bajaDate?: string; bajaReason?: string }>({})

  // Errores de backend (400/409, ej. fecha fuera de rango o doble baja) ya
  // se muestran solos vía el interceptor global de axios (ver client.ts) —
  // no hace falta un onError acá.
  const mutation = useMutation({
    mutationFn: () => policiesApi.deactivateCoverage(policyId, coverage.id, { bajaDate, bajaReason: bajaReason.trim() }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      queryClient.invalidateQueries({ queryKey: policyKeys.detail(policyId) })
      queryClient.invalidateQueries({ queryKey: policyKeys.coverages(policyId) })
      toast.success('Línea dada de baja correctamente')
      onSuccess(updated)
    },
  })

  const assetLabel = coverage.asset ? coverage.asset.name : 'Sin activo asociado'

  const handleConfirm = () => {
    const next: typeof errors = {}
    if (!bajaDate) next.bajaDate = 'Requerido'
    else if (bajaDate < coverage.effectiveDate) next.bajaDate = 'No puede ser anterior a la fecha de alta'
    else if (bajaDate > policyEndDate) next.bajaDate = 'No puede ser posterior al vencimiento de la póliza'
    if (!bajaReason.trim()) next.bajaReason = 'El motivo es obligatorio'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    mutation.mutate()
  }

  return (
    <ConfirmDialog
      open
      title={`Dar de baja — ${assetLabel}`}
      description="Esta acción no elimina la cobertura ni sus adjuntos. La línea quedará en el historial de la póliza."
      confirmLabel="Dar de baja"
      cancelLabel="Cancelar"
      danger
      loading={mutation.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <FormField label="Fecha de baja" required error={errors.bajaDate}>
          <FormInput
            type="date"
            value={bajaDate}
            min={coverage.effectiveDate}
            max={policyEndDate}
            onChange={(e) => setBajaDate(e.target.value)}
          />
        </FormField>
        <FormField label="Motivo de baja" required error={errors.bajaReason}>
          <FormTextarea
            value={bajaReason}
            onChange={(e) => setBajaReason(e.target.value)}
            placeholder="Ej: venta del activo, cambio de aseguradora, error de carga…"
            rows={3}
          />
        </FormField>
      </div>
    </ConfirmDialog>
  )
}
