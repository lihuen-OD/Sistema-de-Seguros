import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../../../shared/components/dialogs/ConfirmDialog'
import { FormField, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { policiesApi, type PolicyRenewalRecord } from '../../../../shared/api/policies.api'
import { invalidateRenewalQueries } from './invalidateRenewalQueries'

const REASON_MAX_LENGTH = 1000

interface RevokeRenewalModalProps {
  renewal: PolicyRenewalRecord
  onClose: () => void
}

// Deshace una renovación activa. No borra nada: el backend completa
// revokedAt/revokedBy/revokeReason y la fila queda en el historial.
export function RevokeRenewalModal({ renewal, onClose }: RevokeRenewalModalProps) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const { previousPolicy, renewalPolicy } = renewal

  // Los errores del backend (409 sin renovación activa, 403, conexión) ya los
  // muestra el interceptor global (ver client.ts). Igual se refresca: si otro
  // usuario la revirtió en el medio, la pantalla tiene que mostrarlo.
  const mutation = useMutation({
    mutationFn: () => policiesApi.revokeRenewal(previousPolicy.id, reason.trim()),
    onSuccess: () => {
      toast.success(`Se deshizo la marca de renovación de la póliza ${previousPolicy.policyNumber}`)
      onClose()
    },
    onSettled: () => invalidateRenewalQueries(queryClient, [previousPolicy.id, ...(renewalPolicy ? [renewalPolicy.id] : [])]),
  })

  // Mismo resguardo contra doble clic que MarkRenewedModal.
  const submittingRef = useRef(false)
  const handleConfirm = () => {
    if (mutation.isPending || submittingRef.current) return
    if (!reason.trim()) {
      setError('El motivo es obligatorio')
      return
    }
    setError(undefined)
    submittingRef.current = true
    mutation.mutate(undefined, { onSettled: () => { submittingRef.current = false } })
  }

  return (
    <ConfirmDialog
      open
      title="Deshacer marca de renovación"
      description={renewalPolicy
        ? `La póliza ${previousPolicy.policyNumber} dejará de figurar como renovada por la póliza ${renewalPolicy.policyNumber}. El vínculo histórico queda registrado como revertido.`
        : `La póliza ${previousPolicy.policyNumber} dejará de figurar como renovada y volverá a mostrarse según sus fechas. La reversión queda registrada en el historial.`}
      confirmLabel="Deshacer marca"
      danger
      loading={mutation.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <FormField label="Motivo" required error={error}>
        <FormTextarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX_LENGTH}
          placeholder="Ej: se vinculó por error la póliza equivocada"
          rows={3}
          autoFocus
        />
      </FormField>
    </ConfirmDialog>
  )
}
