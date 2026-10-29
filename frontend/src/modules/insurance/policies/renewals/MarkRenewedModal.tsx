import { useRef } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../../../shared/components/dialogs/ConfirmDialog'
import { policiesApi } from '../../../../shared/api/policies.api'
import { invalidateRenewalQueries } from './invalidateRenewalQueries'

interface MarkRenewedModalProps {
  policy: { id: string; policyNumber: string }
  onClose: () => void
}

export function MarkRenewedModal({ policy, onClose }: MarkRenewedModalProps) {
  const queryClient = useQueryClient()
  const submittingRef = useRef(false)
  const mutation = useMutation({
    mutationFn: () => policiesApi.createRenewal(policy.id),
    onSuccess: () => {
      toast.success(`La póliza ${policy.policyNumber} quedó marcada como renovada`)
      onClose()
    },
    onSettled: () => {
      submittingRef.current = false
      invalidateRenewalQueries(queryClient, [policy.id])
    },
  })

  const handleConfirm = () => {
    if (mutation.isPending || submittingRef.current) return
    submittingRef.current = true
    mutation.mutate()
  }

  return (
    <ConfirmDialog
      open
      title="Marcar como renovada"
      description={`¿Querés marcar esta póliza como renovada? La vigencia, importes, activos, coberturas y documentos de ${policy.policyNumber} no se modificarán.`}
      confirmLabel="Marcar como renovada"
      danger={false}
      loading={mutation.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  )
}
