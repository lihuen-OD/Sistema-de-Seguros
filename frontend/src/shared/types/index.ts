// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'USER'

// Un módulo = una pantalla otorgable por perfil de acceso (ver Configuración
// → Perfiles de Acceso). Mismo listado que el backend
// (backend/src/shared/types/index.ts) — se mantiene duplicado a propósito,
// igual que ya pasaba con Role antes de este cambio.
export const MODULE_KEYS = [
  'dashboard',
  'assets',
  'policies', 'documents', 'financial_analysis', 'economic_analysis', 'renewal_projections', 'renewal_projections_economic', 'insurance_dashboard',
  'claims',
  'fire_extinguishers', 'fire_extinguisher_audits', 'fire_extinguisher_audit_coverage', 'fire_extinguisher_dashboard',
  'asset_audits', 'asset_audit_coverage', 'asset_audit_dashboard',
  'insurance_audits', 'insurance_audit_coverage', 'insurance_audit_dashboard',
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
  renewal_projections: 'Proyección de Renovaciones (Financiero)',
  renewal_projections_economic: 'Proyección de Renovaciones (Económico)',
  insurance_dashboard: 'Dashboard de Seguros',
  claims: 'Siniestros',
  fire_extinguishers: 'Matafuegos',
  fire_extinguisher_audits: 'Auditoría de Matafuegos',
  fire_extinguisher_audit_coverage: 'Cobertura de Matafuegos',
  fire_extinguisher_dashboard: 'Dashboard de Matafuegos',
  asset_audits: 'Auditoría de Rodados',
  asset_audit_coverage: 'Cobertura de Auditoría de Rodados',
  asset_audit_dashboard: 'Dashboard de Auditoría de Rodados',
  insurance_audits: 'Auditoría de Seguros',
  insurance_audit_coverage: 'Cobertura de Auditoría de Seguros',
  insurance_audit_dashboard: 'Dashboard de Auditoría de Seguros',
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
  // "Auditoría de Rodados" (matafuegos montados en vehículos/maquinaria) vive
  // en este mismo grupo — mismo motor que "Auditoría de Matafuegos", mismo
  // criterio que el sidebar (ver Sidebar.tsx).
  { label: 'Matafuegos', modules: ['fire_extinguishers', 'fire_extinguisher_audits', 'fire_extinguisher_audit_coverage', 'fire_extinguisher_dashboard', 'asset_audits', 'asset_audit_coverage', 'asset_audit_dashboard'] },
  { label: 'Auditoría de Seguros', modules: ['insurance_audits', 'insurance_audit_coverage', 'insurance_audit_dashboard'] },
  { label: 'Seguros', modules: ['policies', 'documents', 'financial_analysis', 'economic_analysis', 'renewal_projections', 'renewal_projections_economic', 'insurance_dashboard', 'claims'] },
  { label: 'Operaciones', modules: ['producers', 'tasks'] },
  { label: 'Configuración', modules: ['companies', 'cost_centers', 'fixed_assets', 'insurance_types', 'module_config'] },
]

// ─── Alcance de auditoría ──────────────────────────────────────────────────────
// Mismo listado que el backend (backend/src/shared/types/index.ts) — duplicado
// a propósito, igual que MODULE_KEYS.
export const AUDIT_SCOPE_AREAS = ['FIRE_EXTINGUISHER_AUDIT', 'ASSET_AUDIT', 'INSURANCE_AUDIT'] as const
export type AuditScopeArea = typeof AUDIT_SCOPE_AREAS[number]

export interface UserAuditScopeItem {
  area: AuditScopeArea
  scopeValue: string
}

// ─── Status types ────────────────────────────────────────────────────────────

export type AssetStatus = 'activo' | 'baja' | 'vendido'

export type PolicyStatus =
  | 'vigente'
  | 'proximo_vencer'
  | 'vencida'
  | 'de_baja'

export type DocumentType =
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'ENDORSEMENT'
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
  // 'economicImpact': el signo lo resuelve economicImpactType del propio
  // documento, no un valor fijo por tipo — hoy solo lo usa Endoso.
  affectsLinkedDirection?: 'credit' | 'debit' | 'adjusts' | 'economicImpact'
  relationType?: RelationType
  requiresAdjustmentReason: boolean
  requiresAdjustmentSign: boolean
  // Endoso: además de su propio importe, se asocia a una póliza propia — la
  // que modifica — distinta de la póliza de la factura vinculada.
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

export type FireExtStatus = 'vigente' | 'proximo_vencer' | 'vencido' | 'sin_fecha'

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
  | 'vehiculo' | 'camioneta' | 'camion' | 'moto' | 'transporte_pasajeros'
  | 'tractor' | 'cosechadora' | 'pulverizadora' | 'implemento'
  | 'edificio' | 'establecimiento' | 'campo_terreno'
  | 'equipo' | 'maquinaria' | 'infraestructura'
  | 'carga_animal' | 'carga_comun'

// Subconjunto de AssetCategory habilitado para Asset.fireExtinguisherAuditable/
// insuranceAuditable (ver IS_FIRE_EXTINGUISHER_AUDITABLE_CATEGORY/
// IS_INSURANCE_AUDITABLE_CATEGORY en modules/assets/AssetNewPage.tsx) — mismo
// listado que AUDITABLE_ASSET_CATEGORIES del backend, usado como scopeValue
// en UserAuditScope para las áreas ASSET_AUDIT/INSURANCE_AUDIT. "moto" solo
// habilita insuranceAuditable (no lleva matafuego), pero comparte este mismo
// listado con fireExtinguisherAuditable como scopeValue.
export const AUDITABLE_ASSET_CATEGORIES: AssetCategory[] = [
  'vehiculo', 'camioneta', 'camion', 'moto', 'transporte_pasajeros',
  'tractor', 'cosechadora', 'pulverizadora', 'implemento', 'maquinaria',
]

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
  valueArs?: number | null
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
  plate?: string
  status: AssetStatus
  patrimonialValueUsd: number | null
  patrimonialValueNew: number | null
  valuationDate: string
  /** Moneda en la que se cargaron los valores de valuación y su tipo de cambio */
  currency?: Currency
  exchangeRate?: number
  /** Cierre de patrimonialValueUsd/patrimonialValueNew en ambas monedas (ver computeDualAmounts) */
  currentValueArs?: number | null
  currentValueUsd?: number | null
  patrimonialValueNewArs?: number | null
  patrimonialValueNewUsd?: number | null
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
  /** Habilita el activo para la Auditoría de Rodados (matafuego montado en el vehículo) */
  fireExtinguisherAuditable: boolean
  /** Habilita el activo para la Auditoría de Seguros (tarjeta de circulación) */
  insuranceAuditable: boolean
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
  policyAssetCoverageId: string
  name: string
  description: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  isCirculationCard: boolean
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
  // Centro(s) de costo del activo (no de la línea de cobertura) — un activo
  // puede repartirse entre varios por %, ver Asset.allocations.
  costCenters?: { name: string; code: string | null; percentage: number }[]
}

// Línea de cobertura dentro de una póliza — un activo (o ninguno, "sin
// activo") con su propio tipo de seguro, coberturas, suma asegurada/tipo de
// cambio y documentación. companyName/costCenterName solo aplican cuando no
// hay activo (con activo, la imputación vive en Asset.allocations).
export interface PolicyCoverage {
  id: string
  policyId: string
  assetId: string | null
  asset?: PolicyAsset | null
  insuranceTypeId: string
  insuranceType: string
  coverageIds: string[]
  coverageNames?: string[]
  insuredAmount: number
  currency: 'ARS' | 'USD'
  exchangeRate: number
  insuredAmountArs: number
  insuredAmountUsd: number
  companyId?: string | null
  companyName?: string | null
  costCenterId?: string | null
  costCenterName?: string | null
  costCenterCode?: string | null
  beneficiaryDescription?: string | null
  attachmentsCount?: number
  circulationCardAttachment?: { id: string; fileUrl?: string; name: string } | null
}

export interface Policy {
  id: string
  policyNumber: string
  insuranceCompany: string
  producerId: string
  startDate: string
  endDate: string
  description: string
  status: PolicyStatus
  isActive?: boolean
  deactivatedAt?: string | null
  // Detalle completo — presente en findById/create/update.
  coverages?: PolicyCoverage[]
  // Agregados del listado (una póliza puede tener varias líneas, cada una
  // con su propio tipo de seguro/activo/suma asegurada).
  coverageCount?: number
  assetCount?: number
  hasSinActivo?: boolean
  assetNames?: string[]
  insuranceTypeNames?: string[]
  totalInsuredAmountArs?: number
  totalInsuredAmountUsd?: number
  circulationCardAttachment?: { id: string; fileUrl?: string; name: string } | null
  // Solo viene cuando se filtra la lista por assetId — la línea de ESE activo.
  assetCoverage?: {
    id: string
    insuranceTypeId: string
    insuranceTypeName: string
    insuredAmount: number
    currency: 'ARS' | 'USD'
    exchangeRate: number
    insuredAmountArs: number | null
    insuredAmountUsd: number | null
    circulationCardAttachment?: { id: string; fileUrl?: string; name: string } | null
  } | null
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
  currency: Currency
  exchangeRate: number
  netAmount: number
  vatAmount: number
  otherTaxesAmount: number
  totalAmount: number
  /** Cierre de totalAmount en ambas monedas al momento de guardar (ver computeDualAmounts) */
  totalAmountArs: number | null
  totalAmountUsd: number | null
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
  allocations?: DocumentPolicyAllocation[]
  attachmentsCount?: number
  createdAt: string
  updatedAt: string
}

// El nombre quedó de cuando apuntaba directo a una póliza — hoy apunta a una
// línea de cobertura (policyAssetCoverageId), que ya sabe a qué póliza y a
// qué activo (o ninguno) corresponde. policyId/assetId son el espejo
// denormalizado que ya manda el backend, para no tener que resolver el join.
export interface DocumentPolicyAllocation {
  id: string
  accountingDocumentId: string
  policyAssetCoverageId: string
  policyId: string
  assetId: string | null
  policy?: { id: string; policyNumber: string; insuranceCompany: string }
  asset?: { id: string; name: string; code: string | null; fixedAssetCode: string | null } | null
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
  currency: Currency
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
  /** Cierre de `amount` en ambas monedas (ver computeDualAmounts) */
  amountArs: number | null
  amountUsd: number | null
  paymentStatus: PaymentStatus
  paidAt: string | null
  paymentMethod: string | null
}

export type InstallmentUpdate = Partial<Pick<Installment, 'amount' | 'paymentStatus' | 'paidAt' | 'dueDate' | 'paymentMethod'>> & {
  /** Tipo de cambio del día de pago — requerido cuando paymentStatus pasa a 'PAID' */
  exchangeRate?: number
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
  chargeDate: string | null
  expirationDate: string | null
  hydraulicTestExpirationDate: string | null
  associatedAssetId: string | null
  associatedLocationType: AssociatedLocationType
  location: string | null
  establishment: string | null
  brand: string | null
  cylinderNumber: string | null
  iramCertificateNumber: string | null
  manufacturingYear: number | null
  status: FireExtStatus
  chargeStatus: FireExtStatus
  manufacturingLifeStatus: FireExtStatus | null
  hydraulicTestStatus: FireExtStatus | null
  manufacturingExpirationYear: number | null
  observations: string
  createdAt: string
  updatedAt: string
  // Poblado solo cuando associatedAssetId apunta a un vehículo/maquinaria
  // (ver fire-extinguishers.service.ts#findById) — usado por Auditoría de
  // Activos para mostrar a qué activo pertenece este matafuego.
  asset?: { id: string; name: string; assetType: string; code: string | null } | null
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
  title?: string | null
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
  claimedAmountUsd?: number | null
  realAmountArs?: number | null
  realAmountUsd?: number | null
  settledAmountArs: number | null
  settledAmountUsd?: number | null
  deductibleArs: number | null
  deductibleUsd?: number | null
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

export interface ClaimExpenseAttachment {
  id: string
  expenseId: string
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
  comment?: string | null
  attachments: ClaimExpenseAttachment[]
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

// Valor de celda para export a Excel/CSV — un número/boolean/Date real (no
// una representación en texto) para que exceljs pueda darle formato numérico
// de verdad (ver TableColumn.numeric / ExportPresetsButton.doExport).
export type ExportCell = string | number | boolean | Date | null

export interface TableColumn<T> {
  key: keyof T | string
  label: string
  render?: (value: unknown, row: T) => React.ReactNode
  exportValue?: (row: T) => ExportCell  // valor de celda para export; fallback: row[key] tal cual (o String(row[key]) si no es un primitivo exportable)
  sortValue?: (row: T) => string | number | null | undefined  // valor real para ordenar; fallback: row[key]
  className?: string
  headerClassName?: string
  sortable?: boolean
  id?: string           // stable ID for column config (defaults to String(key))
  defaultVisible?: boolean  // shown by default when no saved config (default: true)
  hideable?: boolean    // can be hidden by user (default: true; set false for actions col)
  // Da formato numérico (alineado a la derecha, separador de miles) a la
  // columna en el .xlsx exportado — ver ExportPresetsButton.doExport. Sin
  // esto el valor sale como texto plano y no se puede sumar/pivotear en Excel.
  numeric?: boolean
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
