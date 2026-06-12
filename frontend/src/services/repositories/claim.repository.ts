import { mockClaims } from '../../data/mock-claims'
import type { Claim, ClaimStatus } from '../../shared/types'

let claims: Claim[] = [...mockClaims]

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

  getCountByStatus(): Record<ClaimStatus, number> {
    const counts: Record<ClaimStatus, number> = {
      denunciado: 0,
      en_tramite: 0,
      liquidado: 0,
      rechazado: 0,
      cerrado: 0,
    }
    for (const c of claims) counts[c.status]++
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
}
