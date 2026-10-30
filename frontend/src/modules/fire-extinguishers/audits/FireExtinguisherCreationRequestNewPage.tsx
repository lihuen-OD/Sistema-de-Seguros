import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { FireExtinguisherForm } from '../FireExtinguisherNewPage'
import { fireExtinguisherAuditsApi } from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'

export default function FireExtinguisherCreationRequestNewPage() {
  const navigate = useNavigate()
  return (
    <FireExtinguisherForm
      context="audit-request"
      title="Solicitar nuevo matafuego"
      subtitle="El alta quedará pendiente de revisión y no modificará el inventario hasta ser aprobada"
      backTo={ROUTES.FIRE_EXTINGUISHERS_AUDITS}
      backLabel="Volver a Auditorías"
      submitLabel="Enviar solicitud"
      onSubmit={async (input) => {
        await fireExtinguisherAuditsApi.createCreationRequest(input)
        toast.success('Solicitud de alta enviada')
        navigate(ROUTES.FIRE_EXTINGUISHERS_AUDITS, { state: { tab: 'solicitudes' } })
      }}
    />
  )
}
