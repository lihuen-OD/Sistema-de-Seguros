export const CREATION_REQUEST_STATUS_LABELS = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
} as const

export function hasRequiredRejectionReason(value: string): boolean {
  return value.trim().length > 0
}

export function creationRequestTabs(canReview: boolean, canAudit: boolean, pendingCoverageCount: number) {
  return [
    ...(canReview ? [{ id: 'auditorias', label: 'Auditorías' }] : []),
    ...(canAudit ? [{ id: 'cobertura', label: 'Cobertura', count: pendingCoverageCount }] : []),
    { id: 'solicitudes', label: 'Solicitudes de alta' },
  ]
}
import { fireExtinguisherAuditKeys } from '../api/fire-extinguisher-audits.api'
import { fireExtinguisherKeys } from '../api/fire-extinguishers.api'


interface QueryInvalidator {
  invalidateQueries(filters: { queryKey: readonly unknown[]; exact?: boolean }): Promise<unknown>
}

export async function invalidateCreationRequestReviewQueries(
  queryClient: QueryInvalidator,
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: fireExtinguisherAuditKeys.creationRequestLists }),
    queryClient.invalidateQueries({ queryKey: fireExtinguisherAuditKeys.creationRequest(requestId), exact: true }),
  ]

  if (decision === 'APPROVE') {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all, exact: true }),
      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.paginated }),
      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.dashboardSummary, exact: true }),
      queryClient.invalidateQueries({ queryKey: fireExtinguisherAuditKeys.coverage }),
      queryClient.invalidateQueries({ queryKey: fireExtinguisherAuditKeys.auditDashboard }),
    )
  }

  await Promise.all(invalidations)
}
