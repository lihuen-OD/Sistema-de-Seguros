// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'USER'

// Un módulo = una pantalla otorgable por perfil de acceso (ver Configuración
// → Perfiles de Acceso). Mismo listado que el backend
// (backend/src/shared/types/index.ts) — se mantiene duplicado a propósito,
// igual que ya pasaba con Role antes de este cambio.
export const MODULE_KEYS = [
  'dashboard',
  'assets',
  'policies', 'documents', 'financial_analysis', 'economic_analysis',
  'claims',
  'fire_extinguishers', 'fire_extinguisher_audits', 'fire_extinguisher_audit_coverage', 'fire_extinguisher_dashboard',
  'producers', 'tasks',
  'companies', 'cost_centers', 'fixed_assets', 'insurance_types', 'module_config',
] as const

export type ModuleKey = typeof MODULE_KEYS[number]

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  assets: 'Activos',
  policies: 'Pólizas',
  documents: 'Documentos',
  financial_analysis: 'Análisis Financiero',
  economic_analysis: 'Análisis Económico',
  claims: 'Siniestros',
  fire_extinguishers: 'Matafuegos',
  fire_extinguisher_audits: 'Auditoría de Matafuegos',
  fire_extinguisher_audit_coverage: 'Cobertura de Matafuegos',
  fire_extinguisher_dashboard: 'Dashboard de Matafuegos',
  producers: 'Productores',
  tasks: 'Tareas',
  companies: 'Empresas',
  cost_centers: 'Centros de Costo',
  fixed_assets: 'Bienes de Uso',
  insurance_types: 'Tipos de Seguro',
  module_config: 'Config. de Módulos',
}

export interface ModuleGroup {
  label: string
  modules: ModuleKey[]
}

// Mismo agrupamiento visual que ya usa el sidebar — para pintar el picker de
// módulos en Perfiles de Acceso agrupado en vez de una lista plana.
export const MODULE_GROUPS: ModuleGroup[] = [
  { label: 'Principal', modules: ['dashboard'] },
  { label: 'Patrimonio', modules: ['assets'] },
  { label: 'Matafuegos', modules: ['fire_extinguishers', 'fire_extinguisher_audits', 'fire_extinguisher_audit_coverage', 'fire_extinguisher_dashboard'] },
  { label: 'Seguros', modules: ['policies', 'documents', 'financial_analysis', 'economic_analysis', 'claims'] },
  { label: 'Operaciones', modules: ['producers', 'tasks'] },
  { label: 'Configuración', modules: ['companies', 'cost_centers', 'fixed_assets', 'insurance_types', 'module_config'] },
]

// ─── Status types ────────────────────────────────────────────────────────────

export type AssetStatus = 'activo' | 'baja' | 'vendido'

export type PolicyStatus =
  | 'vigente'
  | 'proximo_vencer'
  | 'vencida'
  | 'pendiente_documentacion'
  | 'sin_factura'

export type DocumentType =
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'ENDORSEMENT'
  | 'REBILLING'
  | 'ADJUSTMENT_ENTRY'

export type DocumentStatus = 'ISSUED' | 'APPLIED' | 'CANCELLED' | 'OBSERVED'

export type PaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'NOT_APPLICABLE'

export type RelationType = 'CREDITS' | 'DEBITS' | 'REPLACES' | 'ADJUSTS' | 'ENDORSES'

export type AdjustmentSign = 'POSITIVE' | 'NEGATIVE'

export type EconomicImpactType = 'NO_IMPACT' | 'INCREASES_COST' | 'DECREASES_COST' | 'PENDING_DEFINITION'

// Definición de comportamiento de un tipo de documento contable, obtenida del
// backend vía documentsApi.getTypes() — reemplaza el catálogo editable
// "Tipos de Documento" que existía en Configuración.
export interface DocumentTypeDef {
  key: DocumentType
  label: string
  requiresLinkedDocument: boolean
  linkedDocumentType?: DocumentType
  linkedDocumentLabel?: string
  hasInstallments: boolean
  hasPaymentStatus: boolean
  affectsLinkedBalance: boolean
  affectsLinkedDirection?: 'credit' | 'debit' | 'adjusts' | 'replaces'
  relationType?: RelationType
  requiresAdjustmentReason: boolean
  requiresAdjustmentSign: boolean
  // Endoso: se asocia a una póliza propia y no tiene importes propios — ver
  // document-types.ts (backend) para el detalle de esta excepción deliberada.
  requiresPolicy: boolean
  hasOwnAmounts: boolean
  requiresEconomicImpactType: boolean
  documentStatusOptions: DocumentStatus[]
  paymentStatusOptions: PaymentStatus[]
  isInternal: boolean
}

export interface AdjustmentReasonOption {
  key: string
  label: string
}

export interface EndorsementTypeOption {
  key: string
  label: string
}

export interface EconomicImpactTypeOption {
  key: EconomicImpactType
  label: string
}

export type TaskStatus = 'pendiente' | 'en_curso' | 'finalizada' | 'vencida'

export type TaskPriority = 'baja' | 'media' | 'alta'

export type FireExtStatus = 'vigente' | 'proximo_vencer' | 'vencido'

export type ClaimEventType =
  | 'siniestro_creado'
  | 'estado_cambiado'
  | 'monto_actualizado'
  | 'liquidacion_registrada'
  | 'franquicia_aplicada'
  | 'nota_agregada'
  | 'documento_adjunto'
  | 'siniestro_editado'
  | 'gasto_agregado'
  | 'gasto_editado'
  | 'gasto_eliminado'

export type ClaimOwnershipType = 'propio' | 'terceros'

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
  /** Bien de uso contable asignado — id de la FK y ficha resuelta para mostrar */
  fixedAssetId: string | null
  fixedAsset?: Pick<BienDeUso, 'id' | 'code' | 'name'> | null
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
  uploadedAt: string
  uploadedBy: string
}

export interface PolicyAsset {
  id: string
  internalCode: string
  name: string
  assetType: string
  fixedAssetCode?: string | null
  fixedAssetName?: string | null
  costCenterName?: string | null
  costCenterCode?: string | null
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
  assetIds: string[]
  selectedAssets?: PolicyAsset[]
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
  documentType: DocumentType
  documentStatus: DocumentStatus
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
  description?: string | null
  linkedDocumentId?: string
  relationType?: RelationType
  adjustmentReason?: string
  adjustmentSign?: AdjustmentSign
  // Endoso: póliza a la que modifica (asociación principal, distinta de
  // policyIds que viene de las allocations financieras).
  policyId?: string | null
  economicImpactType?: EconomicImpactType | null
  endorsementType?: string | null
  endorsementEffectiveDate?: string | null
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

// Fase 2 — saldo neto de un documento (normalmente una Factura) considerando
// las Notas de Crédito/Débito y Ajustes aplicados. Ver documents-balance.service.ts.
export interface RelatedDocSummary {
  id: string
  documentNumber: string
  documentType: DocumentType
  documentStatus: DocumentStatus
  totalAmount: number
  adjustmentSign: AdjustmentSign | null
  // true cuando este es el documento al que el documento consultado fue
  // aplicado (su propio linkedDocumentId), no uno de los que lo afectan a él.
  isOrigin: boolean
}

export interface DocumentBalance {
  documentId: string
  documentType: DocumentType
  documentStatus: DocumentStatus
  originalAmount: number
  appliedCredits: number
  appliedDebits: number
  appliedAdjustments: number
  effectiveAmount: number
  paidAmount: number
  outstandingBalance: number
  creditBalance: number
  relatedDocs: RelatedDocSummary[]
}

// Fase 4 — auditoría por documento (quién/cuándo/qué cambió y por qué).
export type DocumentAuditLogAction = 'CREATE' | 'UPDATE' | 'APPLY' | 'CANCEL' | 'PAYMENT_CHANGE'

export interface DocumentAuditLog {
  id: string
  accountingDocumentId: string
  action: DocumentAuditLogAction
  description: string
  previousData?: Record<string, unknown> | null
  newData?: Record<string, unknown> | null
  performedBy?: string | null
  reason?: string | null
  createdAt: string
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
  hydraulicTestExpirationDate: string | null
  associatedAssetId: string | null
  associatedLocationType: AssociatedLocationType
  location: string | null
  establishment: string | null
  brand: string | null
  cylinderNumber: string | null
  manufacturingYear: number | null
  status: FireExtStatus
  chargeStatus: FireExtStatus
  manufacturingLifeStatus: FireExtStatus | null
  hydraulicTestStatus: FireExtStatus | null
  manufacturingExpirationYear: number | null
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
  ownershipType: ClaimOwnershipType
  responsiblePersonName?: string | null
  thirdPartyInsuranceCompany?: string | null
  thirdPartyContact?: string | null
  thirdPartyInsurerContact?: string | null
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

export interface ClaimExpense {
  id: string
  claimId: string
  date: string
  provider: string
  receiptNumber?: string | null
  netAmount: number
  vatAmount: number
  otherTaxesAmount: number
  createdAt: string
  createdBy?: string | null
}

export interface FireExtinguisherHistoryChange {
  field: string
  label: string
  previousValue: string | number | boolean | null
  newValue: string | number | boolean | null
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
  description?: string | null
  changes?: FireExtinguisherHistoryChange[] | null
}

// ─── Bien de Uso (catálogo) ───────────────────────────────────────────────────
// Catálogo simple de bienes de uso — mismo shape que CostCenter. NO es lo
// mismo que un activo físico: es la ficha patrimonial que los activos referencian.

export interface BienDeUso {
  id: string
  code: string
  name: string
  description: string
  status: 'activo' | 'inactivo'
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
  exportValue?: (row: T) => string  // plain string for CSV export; fallback: String(row[key])
  className?: string
  headerClassName?: string
  sortable?: boolean
  id?: string           // stable ID for column config (defaults to String(key))
  defaultVisible?: boolean  // shown by default when no saved config (default: true)
  hideable?: boolean    // can be hidden by user (default: true; set false for actions col)
}

export interface ExportPreset {
  id: string
  name: string
  columnIds: string[]
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}
