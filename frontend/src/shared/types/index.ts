// ─── Status types ────────────────────────────────────────────────────────────

export type AssetStatus = 'activo' | 'baja' | 'vendido'

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

export type ClaimStatus =
  | 'denunciado'
  | 'en_tramite'
  | 'liquidado'
  | 'rechazado'
  | 'cerrado'

export type ClaimType =
  | 'accidente'
  | 'robo'
  | 'incendio'
  | 'granizo'
  | 'daños'
  | 'rotura_mecanica'
  | 'responsabilidad_civil'
  | 'otro'

export type AssetCategory =
  | 'vehiculo' | 'camioneta' | 'camion' | 'moto'
  | 'tractor' | 'cosechadora' | 'pulverizadora' | 'implemento'
  | 'edificio' | 'establecimiento'
  | 'equipo' | 'maquinaria' | 'infraestructura'

export type Currency = 'ARS' | 'USD'

export type PaymentMethod = 'echeq' | 'transferencia' | 'efectivo' | 'debito_automatico' | 'otros'

export type AssociatedLocationType =
  | 'vehiculo'
  | 'maquinaria'
  | 'establecimiento'
  | 'edificio'
  | 'infraestructura'

// ─── Asset sub-entities ───────────────────────────────────────────────────────

export interface AssetAllocation {
  id: string
  companyId: string
  costCenterId: string
  percentage: number
}

export interface Silo {
  id: string
  capacityTons: number
  content: string
}

export interface AssetValueEntry {
  id: string
  date: string
  valueUsd: number
  notes?: string
}

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
  /** Código de Bien de Uso (Finnegans) — es el mismo que internalCode */
  internalCode: string
  name: string
  assetType: string
  brand: string
  model: string
  year: number
  serialNumber: string
  chassisNumber?: string
  status: AssetStatus
  patrimonialValueUsd: number
  valuationDate: string
  /** Historial de valuaciones USD con fecha */
  valueHistory?: AssetValueEntry[]
  observations: string
  /** Imputación contable principal (para compatibilidad con filtros existentes) */
  companyId: string
  costCenterId: string
  /** Asignaciones multi-empresa con porcentaje */
  allocations?: AssetAllocation[]
  /** Código de Bien de Uso (Finnegans) — idéntico a internalCode */
  fixedAssetCode: string
  productiveUnit: string
  area: string
  /** Coordenadas para mapa (extraídas de URL de Google Maps) */
  coordinates?: { lat: number; lng: number }
  mapsUrl?: string
  /** Silos asociados (Establecimientos e Infraestructura tipo Silo) */
  silos?: Silo[]
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
  coverageTypes?: string[]
  beneficiaryDescription?: string
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
  insuranceCompany?: string
  paymentMethod?: PaymentMethod
  linkedDocumentId?: string
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

export interface AssetAttachment {
  id: string
  assetId: string
  name: string
  description: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  expirationDate: string | null
  notifyEmail?: string
  uploadedAt: string
  uploadedBy: string
}

export interface Claim {
  id: string
  assetId: string
  policyId: string | null
  claimNumber: string
  claimType: ClaimType
  occurrenceDate: string
  reportDate: string
  description: string
  insuranceCompany: string
  status: ClaimStatus
  claimedAmountArs: number
  settledAmountArs: number | null
  deductibleArs: number | null
  observations: string | null
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

// ─── Bien de Uso (Finnegans catalog) ─────────────────────────────────────────

export interface BienDeUso {
  id: string
  code: string
  description: string
  category: string
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
