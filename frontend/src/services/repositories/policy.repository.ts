import type { Policy } from '../../shared/types'
import { mockPolicies } from '../../data/mock-policies'

export const policyRepository = {
  findAll(): Policy[] {
    return [...mockPolicies]
  },

  findById(id: string): Policy | undefined {
    return mockPolicies.find((p) => p.id === id)
  },

  findByAsset(assetId: string): Policy[] {
    return mockPolicies.filter((p) => p.assetId === assetId)
  },

  findByProducer(producerId: string): Policy[] {
    return mockPolicies.filter((p) => p.producerId === producerId)
  },

  findByStatus(status: Policy['status']): Policy[] {
    return mockPolicies.filter((p) => p.status === status)
  },

  findByInsuranceCompany(company: string): Policy[] {
    return mockPolicies.filter((p) => p.insuranceCompany === company)
  },

  search(query: string): Policy[] {
    const q = query.toLowerCase()
    return mockPolicies.filter(
      (p) =>
        p.policyNumber.toLowerCase().includes(q) ||
        p.insuranceCompany.toLowerCase().includes(q) ||
        p.insuranceType.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    )
  },

  getTotalInsuredAmountArs(): number {
    return mockPolicies
      .filter((p) => p.status === 'vigente')
      .reduce((sum, p) => sum + p.insuredAmountArs, 0)
  },

  getCountByStatus() {
    return {
      vigente: mockPolicies.filter((p) => p.status === 'vigente').length,
      proximo_vencer: mockPolicies.filter((p) => p.status === 'proximo_vencer').length,
      vencida: mockPolicies.filter((p) => p.status === 'vencida').length,
      pendiente_documentacion: mockPolicies.filter((p) => p.status === 'pendiente_documentacion').length,
      sin_factura: mockPolicies.filter((p) => p.status === 'sin_factura').length,
    }
  },
}
