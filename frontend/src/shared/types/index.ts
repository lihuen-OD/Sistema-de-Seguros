// ─── Status types ────────────────────────────────────────────────────────────

export type AssetStatus =
  | 'activo'
  | 'inactivo'
  | 'en_reparacion'
  | 'vendido'
  | 'dado_de_baja'
  | 'pendiente_documentacion'

export type PolicyStatus =
  | 'vigente'
  | 'proximo_vencer'
  | 'vencida'
  | 'pendiente_documentacion'
  | 'sin_factura'

export type DocumentType = 'factura' | 'endoso' | 'nota_credito' | 'refacturacion'

export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado'

export type TaskStatus = 'pendiente' | 'en_curso' | 'finalizada' | 'vencida'

export type TaskPriority = 'baja' | 'media' | 'alta'

export type FireExtStatus = 'vigente' | 'proximo_vencer' | 'vencido'

export type Currency = 'ARS' | 'USD'

export type AssociatedLocationType =
  | 'vehiculo'
  | 'maquinaria'
  | 'establecimiento'
  | 'edificio'
  | 'infraestructura'

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  taxId: string
  status: 'activo' | 'inactivo'
  createdAt: string
}

export interface CostCenter {
  id: string
  code: string
  name: string
  companyId: string
  area: string
  status: 'activo' | 'inactivo'
}

export interface Asset {
  id: string
  internalCode: string
  name: string
  assetType: string
  brand: string
  model: string
  year: number
  serialNumber: string
  status: AssetStatus
  patrimonialValueUsd: number
  valuationDate: string
  observations: string
  companyId: string
  costCenterId: string
  fixedAssetCode: string
  productiveUnit: string
  area: string
  photos?: string[]
  createdAt: string
  updatedAt: string
}

export interface Policy {
  id: string
  policyNumber: string
  insuranceCompany: string
  producerId: string
  insuranceType: string
  coverageType: string
  startDate: string
  endDate: string
  assetId: string | null
  companyId: string | null
  costCenterId: string | null
  insuredAmountArs: number
  exchangeRate: number
  insuredAmountUsd: number
  description: string
  status: PolicyStatus
  createdAt: string
  updatedAt: string
}

export interface AccountingDocument {
  id: string
  documentType: DocumentType
  documentNumber: string
  issueDate: string
  currency: Currency
  exchangeRate: number
  netAmount: number
  vatAmount: number
  otherTaxesAmount: number
  totalAmount: number
  paymentStatus: PaymentStatus
  createdAt: string
  updatedAt: string
}

export interface DocumentPolicyAllocation {
  id: string
  accountingDocumentId: string
  policyId: string
  allocatedAmount: number
  allocationPercentage: number
}

export interface Installment {
  id: string
  accountingDocumentId: string
  installmentNumber: number
  dueDate: string
  amount: number
  currency: Currency
  paymentStatus: PaymentStatus
  paidAt: string | null
}

export interface Producer {
  id: string
  name: string
  registrationNumber: string
  phone: string
  email: string
  address: string
  status: 'activo' | 'inactivo'
  createdAt: string
}

export interface ProducerTask {
  id: string
  title: string
  description: string
  producerId: string
  policyId: string | null
  assetId: string | null
  assignedTo: string | null
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
  createdAt: string
  completedAt: string | null
}

export interface FireExtinguisher {
  id: string
  code: string
  type: string
  capacity: string
  chargeDate: string
  expirationDate: string
  associatedAssetId: string | null
  associatedLocationType: AssociatedLocationType
  status: FireExtStatus
  observations: string
  createdAt: string
  updatedAt: string
}

export interface FireExtinguisherHistory {
  id: string
  fireExtinguisherId: string
  eventType: string
  eventDate: string
  previousValue: string
  newValue: string
  observations: string
  createdBy: string
}

// ─── Filter / UI types ────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

export interface TableColumn<T> {
  key: keyof T | string
  label: string
  render?: (value: unknown, row: T) => React.ReactNode
  className?: string
  headerClassName?: string
  sortable?: boolean
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}
