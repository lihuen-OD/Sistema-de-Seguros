import { mockInsuranceTypes, type InsuranceTypeConfig } from '../../data/mock-insurance-settings'
export type { InsuranceTypeConfig }

let types: InsuranceTypeConfig[] = [...mockInsuranceTypes]

export const insuranceTypeRepository = {
  findAll(): InsuranceTypeConfig[] {
    return [...types]
  },

  findById(id: string): InsuranceTypeConfig | undefined {
    return types.find((t) => t.id === id)
  },

  findCoverages(id: string): string[] {
    return types.find((t) => t.id === id)?.coverages ?? []
  },

  replaceAll(updated: InsuranceTypeConfig[]): void {
    types = [...updated]
  },
}
