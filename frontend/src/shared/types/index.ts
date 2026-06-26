// ─── Status types ────────────────────────────────────────────────────────────

export type AssetStatus = 'activo' | 'baja' | 'vendido'

export type PolicyStatus =
  | 'vigente'
  | 'proximo_vencer'
  | 'vencida'
  | 'pendiente_documentacion'
  | 'sin_factura'

export type DocumentType = 'factura' | 'endoso' | 'nota_credito' | 'nota_debito' | 'refacturacion'

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

export type ClaimEventType =
  | 'siniestro_creado'
  | 'estado_cambiado'
  | 'monto_actualizado'
  | 'liquidacion_registrada'
  | 'franquicia_aplicada'
  | 'nota_agregada'
  | 'documento_adjunto'
  | 'siniestro_editado'

export interface ClaimEvent {
  id: string
  claimId: string
  date: string
  type: ClaimEventType
  description: string
  previousStatus?: string
  newStatus?: string
  amountLabel?: string
  previousAmount?: number
  newAmount?: number
  author?: string
}

export type ClaimType =
  | 'accidente'
  | 'robo'
  | 'hurto'
  | 'incendio'
  | 'granizo'
  | 'granizo_cosecha'
  | 'inundacion'
  | 'daños'
  | 'daños_electricos'
  | 'rotura_mecanica'
  | 'responsabilidad_civil'
  | 'muerte_accidental'
  | 'incapacidad'
  | 'otro'

export type AssetCategory =
  | 'vehiculo' | 'camioneta' | 'camion' | 'moto'
  | 'tractor' | 'cosechadora' | 'pulverizadora' | 'implemento'
  | 'edificio' | 'establecimiento'
  | 'equipo' | 'maquinaria' | 'infraestructura'
  | 'carga'

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

export interface Building {
  id: string
  name: string
  surfaceM2?: number
  purpose?: string
  constructionType?: string
  constructionYear?: number
}

export interface AssetValueEntry {
  id: string
  date: string
  valueUsd: number
  type: 'real' | 'nuevo'
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
  description: string
  status: 'activo' | 'inactivo'
}

export interface Asset {
  id: string
  /** Código interno del sistema — asignado automáticamente al crear el activo (ACT-XXXXX) */
  internalCode: string
  name: string
  assetType: string
  brand: string
  model: string
  year: number
  serialNumber: string
  chassisNumber?: string
  engineNumber?: string
  status: AssetStatus
  patrimonialValueUsd: number
  patrimonialValueNew: number | null
  valuationDate: string
  /** Historial de valuaciones USD con fecha */
  valueHistory?: AssetValueEntry[]
  observations: string
  /** Imputación contable principal (para compatibilidad con filtros existentes) */
  companyId: string
  costCenterId: string
  /** Asignaciones multi-empresa con porcentaje */
  allocations?: AssetAllocation[]
  /** Código de Bien de Uso de Finnegans — obtenido desde la API externa al seleccionar el bien */
  fixedAssetCode: string
  productiveUnit: string
  area: string
  /** Coordenadas para mapa (extraídas de URL de Google Maps) */
  coordinates?: { lat: number; lng: number }
  mapsUrl?: string
  /** Silos asociados (Establecimientos e Infraestructura tipo Silo) */
  silos?: Silo[]
  /** Edificios/construcciones (Establecimientos) */
  buildings?: Building[]
  photos?: string[]
  /** Datos tipo-específicos persistidos en JSONB (patente, HP, superficie, etc.) */
  metadata?: Record<string, unknown>
  attachmentsCount?: number
  dischargeDate?: string | null
  saleDate?: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountingDocumentAttachment {
  id: string
  documentId: string
  name: string
  description: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  uploadedAt: string
  uploadedBy: string
}

export interface PolicyAttachment {
  id: string
  policyId: string
  name: string
  description: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  expirationDate: string | null
  notifyEmail?: string
  uploadedAt: string
  uploadedBy: string
}

export interface Policy {
  id: string
  policyNumber: string
  insuranceCompany: string
  producerId: string
  insuranceType: string
  coverageType: string
  coverageTypes?: string[]
  coverageNames?: string[]
  beneficiaryDescription?: string
  startDate: string
  endDate: string
  assetId: string | null
  companyId: string | null
  costCenterId: string | null
  insuredAmountArs: number
  exchangeRate: number
  insuredAmountUsd: number
  currency: 'ARS' | 'USD'
  description: string
  status: PolicyStatus
  attachmentsCount?: number
  createdAt: string
  updatedAt: string
}

export interface AccountingDocument {
  id: string
  documentType: string
  documentNumber: string
  issueDate: string
  currency: string
  exchangeRate: number
  netAmount: number
  vatAmount: number
  otherTaxesAmount: number
  totalAmount: number
  paymentStatus: PaymentStatus
  insuranceCompany?: string
  paymentMethod?: string
  linkedDocumentId?: string
  policyIds: string[]
  attachmentsCount?: number
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

export type InstallmentUpdate = Partial<Pick<Installment, 'amount' | 'paymentStatus' | 'paidAt' | 'dueDate'>>

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
  producerId: string | null
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

export interface AssetStatusHistory {
  id: string
  assetId: string
  status: 'activo' | 'baja' | 'vendido'
  date: string
  note: string | null
  createdAt: string
}

export interface AssetAttachment {
  id: string
  assetId: string
  name: string
  description: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  expirationDate: string | null
  notifyEmail?: string
  uploadedAt: string
  uploadedBy: string
  /** Solo en memoria durante creación — nunca persistido ni enviado al backend */
  pendingFile?: File
}

export interface Claim {
  id: string
  assetId: string | null
  policyId: string | null
  claimNumber: string
  claimType: string
  occurrenceDate: string
  reportDate: string
  description: string
  insuranceCompany: string
  status: string
  claimedAmountArs: number
  realAmountArs?: number | null
  settledAmountArs: number | null
  deductibleArs: number | null
  currency?: Currency
  exchangeRate?: number
  observations: string | null
  createdAt: string
  updatedAt: string
}

export interface ClaimAttachment {
  id: string
  claimId: string
  name: string
  description: string | null
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  uploadedAt: string
  uploadedBy: string
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

// ─── Bien de Uso (Finnegans API response) ────────────────────────────────────
// Represents a fixed-asset record from Finnegans. NOT the same as a physical
// asset — it is the accounting ledger entry that our assets can reference.

export interface BienDeUso {
  id: string                 // Finnegans internal UUID
  code: string               // Finnegans display code  (e.g. ROD-001)
  description: string        // Accounting description
  category: string           // Accounting category (Rodados, Maquinaria, etc.)
  incorporationDate: string  // Fecha de incorporación al patrimonio
  usefulLifeYears: number    // Vida útil contable (años)
  depreciationRate: number   // Tasa de amortización anual (%)
  originalValueArs: number   // Valor de incorporación en ARS
  bookValueArs: number       // Valor residual contable actual en ARS
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
