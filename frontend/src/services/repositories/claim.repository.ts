import { mockClaims } from '../../data/mock-claims'
import { mockClaimEvents } from '../../data/mock-claim-events'
import type { Claim, ClaimEvent } from '../../shared/types'

let claims: Claim[] = [...mockClaims]
let events: ClaimEvent[] = [...mockClaimEvents]

export const claimRepository = {
  findAll(): Claim[] {
    return claims
  },

  findByAsset(assetId: string): Claim[] {
    return claims.filter((c) => c.assetId === assetId)
  },

  findByPolicy(policyId: string): Claim[] {
    return claims.filter((c) => c.policyId === policyId)
  },

  findById(id: string): Claim | undefined {
    return claims.find((c) => c.id === id)
  },

  getCountByStatus(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const c of claims) counts[c.status] = (counts[c.status] ?? 0) + 1
    return counts
  },

  getTotals(): { totalClaimed: number; totalSettled: number } {
    return claims.reduce(
      (acc, c) => ({
        totalClaimed: acc.totalClaimed + c.claimedAmountArs,
        totalSettled: acc.totalSettled + (c.settledAmountArs ?? 0),
      }),
      { totalClaimed: 0, totalSettled: 0 },
    )
  },

  create(claim: Claim): Claim {
    claims = [claim, ...claims]
    return claim
  },

  update(id: string, patch: Partial<Claim>): Claim | undefined {
    const idx = claims.findIndex((c) => c.id === id)
    if (idx === -1) return undefined
    claims[idx] = { ...claims[idx], ...patch, updatedAt: new Date().toISOString().split('T')[0] }
    return claims[idx]
  },

  remove(id: string): void {
    claims = claims.filter((c) => c.id !== id)
  },

  findEventsByClaim(claimId: string): ClaimEvent[] {
    return events
      .filter((e) => e.claimId === claimId)
      .sort((a, b) => b.date.localeCompare(a.date))
  },

  addEvent(event: ClaimEvent): ClaimEvent {
    events = [event, ...events]
    return event
  },
}
