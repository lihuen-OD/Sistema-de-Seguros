import type { Policy } from '../../shared/types'
import { mockPolicies } from '../../data/mock-policies'

let policies: Policy[] = [...mockPolicies]

export const policyRepository = {
  findAll(): Policy[] {
    return [...policies]
  },

  findById(id: string): Policy | undefined {
    return policies.find((p) => p.id === id)
  },

  findByAsset(assetId: string): Policy[] {
    return policies.filter((p) => p.assetId === assetId)
  },

  findByProducer(producerId: string): Policy[] {
    return policies.filter((p) => p.producerId === producerId)
  },

  findByStatus(status: Policy['status']): Policy[] {
    return policies.filter((p) => p.status === status)
  },

  findByInsuranceCompany(company: string): Policy[] {
    return policies.filter((p) => p.insuranceCompany === company)
  },

  search(query: string): Policy[] {
    const q = query.toLowerCase()
    return policies.filter(
      (p) =>
        p.policyNumber.toLowerCase().includes(q) ||
        p.insuranceCompany.toLowerCase().includes(q) ||
        p.insuranceType.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    )
  },

  create(data: Omit<Policy, 'id'>): Policy {
    const newPolicy: Policy = { ...data, id: `policy-${Date.now()}` }
    policies = [...policies, newPolicy]
    return newPolicy
  },

  update(id: string, changes: Partial<Omit<Policy, 'id' | 'createdAt'>>): Policy | undefined {
    let updated: Policy | undefined
    policies = policies.map((p) => {
      if (p.id !== id) return p
      updated = { ...p, ...changes, updatedAt: new Date().toISOString().slice(0, 10) }
      return updated!
    })
    return updated
  },

  delete(id: string): boolean {
    const exists = policies.some((p) => p.id === id)
    if (!exists) return false
    policies = policies.filter((p) => p.id !== id)
    return true
  },

  getTotalInsuredAmountArs(): number {
    return policies
      .filter((p) => p.status === 'vigente')
      .reduce((sum, p) => sum + p.insuredAmountArs, 0)
  },

  getCountByStatus() {
    return {
      vigente: policies.filter((p) => p.status === 'vigente').length,
      proximo_vencer: policies.filter((p) => p.status === 'proximo_vencer').length,
      vencida: policies.filter((p) => p.status === 'vencida').length,
      pendiente_documentacion: policies.filter((p) => p.status === 'pendiente_documentacion').length,
      sin_factura: policies.filter((p) => p.status === 'sin_factura').length,
    }
  },
}
