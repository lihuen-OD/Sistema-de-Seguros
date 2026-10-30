import { RefreshCw } from 'lucide-react'
import { hasModule } from '../../../../app/auth/roleScope'
import type { CurrentUser } from '../../../../shared/api/auth.api'
import type { Policy } from '../../../../shared/types'

export type RenewablePolicy = Pick<Policy, 'id' | 'policyNumber' | 'status' | 'renewal'>

interface PolicyRenewalActionProps {
  policy: RenewablePolicy
  user: CurrentUser | null
  onOpen: (policy: RenewablePolicy) => void
}

export function PolicyRenewalAction({ policy, user, onOpen }: PolicyRenewalActionProps) {
  if (
    !hasModule(user, 'policy_renewals') ||
    policy.status === 'de_baja' ||
    policy.renewal?.isMarked
  ) {
    return null
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen(policy)
      }}
      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
      title="Marcar como renovada"
      aria-label="Marcar como renovada"
    >
      <RefreshCw size={15} />
    </button>
  )
}
