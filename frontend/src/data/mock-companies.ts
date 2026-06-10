import type { Company } from '../shared/types'

export const mockCompanies: Company[] = [
  {
    id: 'comp-1',
    name: 'Agropecuaria Los Olivos S.A.',
    taxId: '30-71234567-8',
    status: 'activo',
    createdAt: '2020-01-15',
  },
  {
    id: 'comp-2',
    name: 'Transportes del Sur S.R.L.',
    taxId: '30-68901234-5',
    status: 'activo',
    createdAt: '2019-06-20',
  },
  {
    id: 'comp-3',
    name: 'Inversiones Pampeanas S.A.',
    taxId: '30-75432109-1',
    status: 'activo',
    createdAt: '2021-03-10',
  },
  {
    id: 'comp-4',
    name: 'Construcciones Rioplatense S.A.',
    taxId: '30-62345678-9',
    status: 'activo',
    createdAt: '2018-11-05',
  },
  {
    id: 'comp-5',
    name: 'Logística Integral Norte S.R.L.',
    taxId: '30-79876543-2',
    status: 'inactivo',
    createdAt: '2022-07-01',
  },
]
