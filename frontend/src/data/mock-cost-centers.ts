import type { CostCenter } from '../shared/types'

export const mockCostCenters: CostCenter[] = [
  { id: 'cc-1', code: 'CC-001', name: 'Producción Agrícola Norte', companyId: 'comp-1', area: 'Producción', status: 'activo' },
  { id: 'cc-2', code: 'CC-002', name: 'Producción Agrícola Sur', companyId: 'comp-1', area: 'Producción', status: 'activo' },
  { id: 'cc-3', code: 'CC-003', name: 'Ganadería', companyId: 'comp-1', area: 'Producción', status: 'activo' },
  { id: 'cc-4', code: 'CC-004', name: 'Administración Central', companyId: 'comp-1', area: 'Administración', status: 'activo' },
  { id: 'cc-5', code: 'CC-005', name: 'Flota de Transporte', companyId: 'comp-2', area: 'Logística', status: 'activo' },
  { id: 'cc-6', code: 'CC-006', name: 'Depósitos', companyId: 'comp-2', area: 'Logística', status: 'activo' },
  { id: 'cc-7', code: 'CC-007', name: 'Inversiones Inmobiliarias', companyId: 'comp-3', area: 'Comercial', status: 'activo' },
  { id: 'cc-8', code: 'CC-008', name: 'Proyectos Especiales', companyId: 'comp-3', area: 'Producción', status: 'activo' },
  { id: 'cc-9', code: 'CC-009', name: 'Obras Civiles', companyId: 'comp-4', area: 'Producción', status: 'activo' },
  { id: 'cc-10', code: 'CC-010', name: 'Mantenimiento', companyId: 'comp-4', area: 'Mantenimiento', status: 'activo' },
  { id: 'cc-11', code: 'CC-011', name: 'Recursos Humanos', companyId: 'comp-1', area: 'RRHH', status: 'activo' },
  { id: 'cc-12', code: 'CC-012', name: 'Comercialización', companyId: 'comp-2', area: 'Comercial', status: 'activo' },
]
