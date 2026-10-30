import type { Prisma } from '@prisma/client'
import { computePolicyStatus, computeEffectivePolicyStatus, toDateStr } from '../../shared/utils/dates'

// Criterio de búsqueda de pólizas compartido por el selector de los
// formularios (policiesService.search) y el buscador global del Topbar
// (search.service.ts) — mismo patrón que assets/asset-search.ts.

export function buildPolicySearchWhere(q: string): Prisma.PolicyWhereInput {
  if (!q) return {}
  return {
    OR: [
      { policyNumber: { contains: q, mode: 'insensitive' } },
      { insuredName: { contains: q, mode: 'insensitive' } },
      { producer: { is: { name: { contains: q, mode: 'insensitive' } } } },
      { coverages: { some: { insuranceType: { name: { contains: q, mode: 'insensitive' } } } } },
      { coverages: { some: { asset: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
      { coverages: { some: { asset: { is: { code: { contains: q, mode: 'insensitive' } } } } } },
    ],
  }
}

// El número de póliza es el identificador — el buscador global antepone su
// coincidencia exacta a las parciales (caso particular de buildPolicySearchWhere).
export function buildPolicyExactMatchWhere(q: string): Prisma.PolicyWhereInput {
  return { policyNumber: { equals: q, mode: 'insensitive' } }
}

export function isPolicyExactMatch(policy: { policyNumber: string }, q: string): boolean {
  return policy.policyNumber.toLowerCase() === q.toLowerCase()
}

export const POLICY_SEARCH_SELECT = {
  id: true,
  policyNumber: true,
  insuredName: true,
  startDate: true,
  endDate: true,
  deactivatedAt: true,
  producer: { select: { name: true } },
  coverages: { select: { insuranceType: { select: { name: true } } } },
  renewalLinksAsPrevious: { where: { revokedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.PolicySelect

export const POLICY_SEARCH_ORDER_BY: Prisma.PolicyOrderByWithRelationInput[] = [
  { endDate: 'desc' },
  { policyNumber: 'asc' },
]

type PolicySearchRow = Prisma.PolicyGetPayload<{ select: typeof POLICY_SEARCH_SELECT }>

export function mapPolicySearchResult(policy: PolicySearchRow) {
  return {
    id: policy.id,
    policyNumber: policy.policyNumber,
    insuranceCompany: policy.insuredName,
    status: policy.deactivatedAt ? 'de_baja' : computePolicyStatus(policy.endDate),
    effectiveStatus: computeEffectivePolicyStatus({
      endDate: policy.endDate,
      deactivatedAt: policy.deactivatedAt,
      hasActiveRenewal: (policy.renewalLinksAsPrevious?.length ?? 0) > 0,
    }),
    startDate: toDateStr(policy.startDate),
    endDate: toDateStr(policy.endDate),
    producerName: policy.producer?.name ?? null,
    insuranceTypeNames: [...new Set(policy.coverages.map((coverage) => coverage.insuranceType.name))],
  }
}
