import type { Company } from '../../shared/types'
import { mockCompanies } from '../../data/mock-companies'

let companies: Company[] = [...mockCompanies]
let idSeq = companies.length + 1

export interface CompanyInput {
  name: string
  taxId: string
  status: 'activo' | 'inactivo'
}

export const companyRepository = {
  findAll(): Company[] {
    return [...companies]
  },

  findById(id: string): Company | undefined {
    return companies.find((c) => c.id === id)
  },

  findActive(): Company[] {
    return companies.filter((c) => c.status === 'activo')
  },

  create(input: CompanyInput): Company {
    const today = new Date().toISOString().slice(0, 10)
    const company: Company = {
      id: `comp-${idSeq++}`,
      name: input.name.trim(),
      taxId: input.taxId.trim(),
      status: input.status,
      createdAt: today,
    }
    companies = [...companies, company]
    mockCompanies.push(company)
    return company
  },

  update(id: string, input: Partial<CompanyInput>): Company | null {
    const existing = companies.find((c) => c.id === id)
    if (!existing) return null
    const updated: Company = {
      ...existing,
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.taxId !== undefined && { taxId: input.taxId.trim() }),
      ...(input.status !== undefined && { status: input.status }),
    }
    companies = companies.map((c) => (c.id === id ? updated : c))
    const idx = mockCompanies.findIndex((c) => c.id === id)
    if (idx !== -1) mockCompanies[idx] = updated
    return updated
  },
}
