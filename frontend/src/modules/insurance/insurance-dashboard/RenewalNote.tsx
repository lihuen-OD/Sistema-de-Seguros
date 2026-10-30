import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { renewalNoteForAsset } from '../../../shared/utils/policyAdminStatus'
import type { Policy } from '../../../shared/types'

interface RenewalNoteProps {
  policyId: string
  assetId: string
  policiesById: Map<string, Policy>
}

// Completa una alerta de vencimiento POR ACTIVO cuando su póliza ya fue
// renovada. La alerta no se oculta: una renovación parcial puede dejar al
// activo sin cobertura, y eso es justamente lo que esta nota hace visible.
export function RenewalNote({ policyId, assetId, policiesById }: RenewalNoteProps) {
  const note = renewalNoteForAsset(policyId, assetId, policiesById)
  if (!note) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusPill status="renovada" size="sm" label={`Renovada → ${note.renewedBy.policyNumber}`} />
      {note.assetContinues === false && (
        <span className="text-xs font-medium text-amber-700">El activo no continúa en la nueva</span>
      )}
      {note.assetContinues === true && <span className="text-xs text-slate-500">El activo continúa</span>}
    </span>
  )
}
