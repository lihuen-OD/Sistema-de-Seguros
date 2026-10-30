import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { fetchAllPages, type CompleteList, type ListSortParams, type ListSummaryParams, type PaginatedResult } from './pagination'
import { triggerBlobDownload } from '../utils/downloadFile'
import type { Policy, PolicyStatus, PolicyEffectiveStatus, PolicyRef, PolicyCoverage, PolicyAsset, PolicyAttachment, ProducerTask, TaskPriority, Currency } from '../types'

interface BackendInsuranceType { id: string; name: string; coverages?: { id: string; name: string; description: string | null }[] }
interface BackendCompany { id: string; name: string }
interface BackendCostCenter { id: string; name: string; code: string | null }
interface BackendProducer { id: string; name: string }
interface BackendCoverage { id: string; name: string; description: string | null }
interface BackendPolicyAsset {
  id: string; code: string | null; name: string; assetType: string
  status?: string
  fixedAssetCode: string | null
  metadata?: Record<string, unknown> | null
  brand?: string | null
  model?: string | null
  fixedAsset?: { id: string; code: string | null; name: string } | null
  allocations?: { percentage: number; costCenter: { id: string; code: string | null; name: string } | null }[]
}
interface BackendCirculationCard { id: string; fileUrl: string; name: string }
interface BackendPolicyCoverage {
  id: string; policyId: string; assetId: string | null
  insuranceTypeId: string; coverageIds: string[]
  insuredAmount: number; currency: string; exchangeRate: number
  insuredAmountArs: number | null; insuredAmountUsd: number | null
  companyId: string | null; costCenterId: string | null; beneficiaryDescription: string | null
  insuranceType: BackendInsuranceType
  selectedCoverages?: BackendCoverage[]
  company?: BackendCompany | null
  costCenter?: BackendCostCenter | null
  asset?: BackendPolicyAsset | null
  attachments?: BackendCirculationCard[]
  _count?: { attachments: number }
  effectiveDate: string
  bajaDate: string | null
  bajaReason: string | null
  deactivatedAt?: string | null
  deactivatedBy?: string | null
}
interface BackendAssetCoverageSummary {
  id: string; insuranceTypeId: string; insuranceTypeName: string
  insuredAmount: number; currency: string; exchangeRate: number
  insuredAmountArs: number | null; insuredAmountUsd: number | null
  effectiveDate: string; bajaDate: string | null
  circulationCardAttachment?: BackendCirculationCard | null
}
interface BackendPolicy {
  id: string; policyNumber: string; producerId: string | null
  insuredName: string; startDate: string; endDate: string
  description: string | null
  isActive: boolean; status: string; deactivatedAt: string | null
  // Opcional: un backend anterior a R2 no lo manda (despliegue escalonado).
  effectiveStatus?: string
  renewal?: { isMarked?: boolean; renewedBy: PolicyRef | null; renewalOf?: PolicyRef[] }
  createdAt: string; updatedAt: string
  producer?: BackendProducer | null
  coverages?: BackendPolicyCoverage[]
  // Agregados del listado
  coverageCount?: number; assetCount?: number; hasSinActivo?: boolean
  assetNames?: string[]
  insuranceTypeNames?: string[]
  totalInsuredAmountArs?: number; totalInsuredAmountUsd?: number
  circulationCardAttachment?: BackendCirculationCard | null
  assetCoverage?: BackendAssetCoverageSummary | null
  attachmentsCount?: number
}
export interface BackendPolicySearchResult {
  id: string; policyNumber: string; insuranceCompany: string; status: string; effectiveStatus?: string
  startDate: string; endDate: string; producerName: string | null; insuranceTypeNames: string[]
}
interface BackendTask {
  id: string; producerId: string; title: string; description: string | null
  dueDate: string | null; status: string; createdAt: string; updatedAt: string
  completedAt: string | null; priority: string; assignedTo: string | null
  policyId: string | null; assetId: string | null
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

const today = () => new Date().toISOString().slice(0, 10)

function mapTaskStatus(s: string, dueDate?: string | null): ProducerTask['status'] {
  if (s === 'completada' || s === 'cancelada') return 'finalizada'
  if (s === 'en_progreso') return 'en_curso'
  if (s === 'pendiente' && dueDate && dueDate < today()) return 'vencida'
  return 'pendiente'
}

function mapTask(t: BackendTask): ProducerTask {
  return {
    id: t.id, title: t.title, description: t.description ?? '',
    producerId: t.producerId,
    policyId: t.policyId ?? null,
    assetId: t.assetId ?? null,
    assignedTo: t.assignedTo ?? null,
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
    priority: (t.priority ?? 'media') as TaskPriority,
    status: mapTaskStatus(t.status, t.dueDate),
    createdAt: t.createdAt, completedAt: t.completedAt ?? null,
  }
}

// Un estado que el frontend no reconoce nunca se convierte en uno válido (antes
// caía en 'vigente' y sumaba como cobertura activa): queda como 'desconocido'
// ("Sin clasificar", fuera de toda categoría y de toda suma activa) y se
// registra una vez por valor para que se pueda investigar.
const reportedUnknownStatuses = new Set<string>()

function reportUnknownStatus(field: 'status' | 'effectiveStatus', value: unknown) {
  const key = `${field}:${String(value)}`
  if (reportedUnknownStatuses.has(key)) return
  reportedUnknownStatuses.add(key)
  console.error(`[policies.api] ${field} desconocido recibido del backend: "${String(value)}" — se muestra como "Sin clasificar"`)
}

function mapStatus(s: string): PolicyStatus {
  if (s === 'proxima_a_vencer') return 'proximo_vencer'
  if (s === 'vigente' || s === 'vencida' || s === 'de_baja') return s
  reportUnknownStatus('status', s)
  return 'desconocido'
}

const EFFECTIVE_STATUS_FROM_BACKEND: Record<string, Exclude<PolicyEffectiveStatus, 'desconocido'>> = {
  vigente: 'vigente',
  proxima_a_vencer: 'proximo_vencer',
  renovada: 'renovada',
  vencida: 'vencida',
  de_baja: 'de_baja',
}

function mapEffectiveStatus(s: string | undefined, contractual: PolicyStatus): PolicyEffectiveStatus {
  // Backend anterior a R2: sin el campo, el estado contractual es exactamente
  // el administrativo de una póliza sin renovación (no inventa ninguna).
  if (s === undefined) return contractual
  const mapped = EFFECTIVE_STATUS_FROM_BACKEND[s]
  if (mapped) return mapped
  reportUnknownStatus('effectiveStatus', s)
  return 'desconocido'
}

// Resultado liviano de /policies/search — también lo devuelve el buscador
// global (/search), por eso se exporta en vez de mapearlo de nuevo allá.
export function mapPolicySearchResult(policy: BackendPolicySearchResult): PolicySearchResult {
  const status = mapStatus(policy.status)
  return { ...policy, status, effectiveStatus: mapEffectiveStatus(policy.effectiveStatus, status) }
}

function mapPolicyAsset(a: BackendPolicyAsset): PolicyAsset {
  return {
    id: a.id,
    internalCode: a.code ?? '',
    name: a.name,
    assetType: a.assetType,
    status: a.status as PolicyAsset['status'],
    fixedAssetCode: a.fixedAssetCode,
    fixedAssetName: a.fixedAsset?.name ?? null,
    metadata: a.metadata ?? null,
    brand: a.brand ?? null,
    model: a.model ?? null,
    costCenters: (a.allocations ?? [])
      .filter((alloc) => !!alloc.costCenter)
      .map((alloc) => ({ name: alloc.costCenter!.name, code: alloc.costCenter!.code, percentage: alloc.percentage })),
  }
}

// effectiveDate es NOT NULL en la base — si llega undefined es un select del
// backend que se olvidó de pedirlo (ya pasó una vez, ver COVERAGE_LIST_SELECT
// en policies.service.ts), no un dato real ausente. Fallback a '' en vez de
// explotar toda la pantalla por un campo faltante de un listado.
function mapCoverageEffectiveDate(c: BackendPolicyCoverage): string {
  if (!c.effectiveDate) {
    if (import.meta.env.DEV) {
      console.warn(`[mapCoverage] effectiveDate faltante en coverage ${c.id} — revisar el select del endpoint`)
    }
    return ''
  }
  return c.effectiveDate.slice(0, 10)
}

function mapCoverage(c: BackendPolicyCoverage): PolicyCoverage {
  return {
    id: c.id,
    policyId: c.policyId,
    assetId: c.assetId,
    asset: c.asset ? mapPolicyAsset(c.asset) : c.asset === null ? null : undefined,
    insuranceTypeId: c.insuranceTypeId,
    insuranceType: c.insuranceType?.name ?? '',
    coverageIds: c.coverageIds,
    coverageNames: c.selectedCoverages?.map((cov) => cov.name) ?? [],
    insuredAmount: c.insuredAmount,
    currency: (c.currency === 'USD' ? 'USD' : 'ARS') as Currency,
    exchangeRate: c.exchangeRate,
    insuredAmountArs: c.insuredAmountArs ?? 0,
    insuredAmountUsd: c.insuredAmountUsd ?? 0,
    companyId: c.companyId,
    companyName: c.company?.name ?? null,
    costCenterId: c.costCenterId,
    costCenterName: c.costCenter?.name ?? null,
    costCenterCode: c.costCenter?.code ?? null,
    beneficiaryDescription: c.beneficiaryDescription,
    attachmentsCount: c._count?.attachments ?? 0,
    circulationCardAttachment: c.attachments?.[0] ?? null,
    effectiveDate: mapCoverageEffectiveDate(c),
    bajaDate: c.bajaDate ? c.bajaDate.slice(0, 10) : null,
    bajaReason: c.bajaReason ?? null,
    deactivatedAt: c.deactivatedAt ?? null,
    deactivatedBy: c.deactivatedBy ?? null,
  }
}

function mapPolicy(b: BackendPolicy): Policy {
  const status = mapStatus(b.status)
  return {
    id: b.id,
    policyNumber: b.policyNumber,
    insuranceCompany: b.insuredName,
    producerId: b.producerId ?? '',
    startDate: b.startDate?.slice(0, 10) ?? '',
    endDate: b.endDate?.slice(0, 10) ?? '',
    description: b.description ?? '',
    status,
    effectiveStatus: mapEffectiveStatus(b.effectiveStatus, status),
    renewal: b.renewal ? {
      isMarked: b.renewal.isMarked ?? Boolean(b.renewal.renewedBy),
      renewedBy: b.renewal.renewedBy ?? null,
      renewalOf: b.renewal.renewalOf,
    } : undefined,
    isActive: b.isActive,
    deactivatedAt: b.deactivatedAt,
    coverages: b.coverages ? b.coverages.map(mapCoverage) : undefined,
    coverageCount: b.coverageCount,
    assetCount: b.assetCount,
    hasSinActivo: b.hasSinActivo,
    assetNames: b.assetNames,
    insuranceTypeNames: b.insuranceTypeNames,
    totalInsuredAmountArs: b.totalInsuredAmountArs,
    totalInsuredAmountUsd: b.totalInsuredAmountUsd,
    circulationCardAttachment: b.circulationCardAttachment ?? null,
    assetCoverage: b.assetCoverage
      ? {
          id: b.assetCoverage.id,
          insuranceTypeId: b.assetCoverage.insuranceTypeId,
          insuranceTypeName: b.assetCoverage.insuranceTypeName,
          insuredAmount: b.assetCoverage.insuredAmount,
          currency: (b.assetCoverage.currency === 'USD' ? 'USD' : 'ARS') as Currency,
          exchangeRate: b.assetCoverage.exchangeRate,
          insuredAmountArs: b.assetCoverage.insuredAmountArs,
          insuredAmountUsd: b.assetCoverage.insuredAmountUsd,
          effectiveDate: b.assetCoverage.effectiveDate?.slice(0, 10) ?? '',
          bajaDate: b.assetCoverage.bajaDate ? b.assetCoverage.bajaDate.slice(0, 10) : null,
          circulationCardAttachment: b.assetCoverage.circulationCardAttachment ?? null,
        }
      : b.assetCoverage === null ? null : undefined,
    attachmentsCount: b.attachmentsCount ?? 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface PolicyCoverageInput {
  id?: string
  assetId?: string | null
  insuranceTypeId: string
  coverageIds?: string[]
  insuredAmount?: number
  currency?: Currency
  exchangeRate?: number
  companyId?: string | null
  costCenterId?: string | null
  beneficiaryDescription?: string | null
}

export interface PolicyCreateInput {
  policyNumber: string
  producerId?: string | null
  insuredName: string
  startDate: string
  endDate: string
  description?: string
  coverages: PolicyCoverageInput[]
}

export type PolicyUpdateInput = Partial<Omit<PolicyCreateInput, 'policyNumber' | 'coverages'>>

export interface PolicySearchResult {
  id: string
  policyNumber: string
  insuranceCompany: string
  status: PolicyStatus
  effectiveStatus: PolicyEffectiveStatus
  startDate: string
  endDate: string
  producerName: string | null
  insuranceTypeNames: string[]
}

export interface PolicySearchParams {
  q?: string
  limit?: number
  selectedId?: string
  assetId?: string
  insuranceCompany?: string
  activeOnly?: boolean
}

// Alta explícita de una línea nueva (POST /coverages) — a diferencia de
// PolicyCoverageInput (usado por create()/replaceCoverages(), que todavía
// completan effectiveDate con policy.startDate), acá la fecha de alta la
// elige quien la carga.
export interface AddCoverageInput extends Omit<PolicyCoverageInput, 'id'> {
  effectiveDate: string
}

export interface DeactivateCoverageInput {
  bajaDate: string
  bajaReason: string
}

// ── Renovación (R1/R3) — mismos contratos que policy-renewals.service.ts ─────
// Solo vínculo administrativo: nada de esto cambia fechas, líneas, sumas ni
// documentos de ninguna de las dos pólizas.

export interface RenewalNotice { code: string; message: string }

export interface RenewalPolicySummary {
  id: string; policyNumber: string; insuredName: string
  producer: { id: string; name: string } | null
  startDate: string; endDate: string
  isDeBaja: boolean
}

export interface RenewalLineSummary {
  id: string
  insuranceType: { id: string; name: string }
  coverages: { id: string; name: string }[]
  insuredAmount: number
  currency: string
}

export interface RenewalAssetRef { id: string; name: string; code: string | null }

export type RenewalLineDifference = 'insuranceType' | 'coverages' | 'currency' | 'insuredAmount'

export interface PolicyRenewalPreview {
  previousPolicy: RenewalPolicySummary
  renewalPolicy: RenewalPolicySummary
  // false = hay al menos un bloqueo estructural; las advertencias nunca bloquean.
  canRenew: boolean
  blockers: RenewalNotice[]
  warnings: RenewalNotice[]
  comparison: {
    overlapDays: number
    gapDays: number
    continuingAssets: { asset: RenewalAssetRef; previous: RenewalLineSummary; renewal: RenewalLineSummary; differences: RenewalLineDifference[] }[]
    removedAssets: { asset: RenewalAssetRef; previous: RenewalLineSummary }[]
    addedAssets: { asset: RenewalAssetRef; renewal: RenewalLineSummary }[]
    previousLinesWithoutAsset: RenewalLineSummary[]
    renewalLinesWithoutAsset: RenewalLineSummary[]
  }
}

export interface RenewalPolicyRef { id: string; policyNumber: string; insuredName: string; startDate: string; endDate: string }

// Una fila del historial append-only: revertir completa revokedAt/By/Reason,
// nunca borra.
export interface PolicyRenewalRecord {
  id: string
  status: 'ACTIVE' | 'REVOKED'
  notes: string | null
  createdBy: string
  createdAt: string
  revokedAt: string | null
  revokedBy: string | null
  revokeReason: string | null
  previousPolicy: RenewalPolicyRef
  renewalPolicy: RenewalPolicyRef | null
}

export const policiesApi = {
  async search(params: PolicySearchParams): Promise<PolicySearchResult[]> {
    const res = await apiClient.get<{ data: BackendPolicySearchResult[] }>('/policies/search', { params })
    return res.data.data.map(mapPolicySearchResult)
  },

  async findAll(filters?: { assetId?: string; companyId?: string; producerId?: string; insuranceTypeId?: string; limit?: number; includeCoverages?: boolean }): Promise<Policy[]> {
    const res = await apiClient.get<Paginated<BackendPolicy>>('/policies', { params: { limit: 200, ...filters } })
    return res.data.data.map(mapPolicy)
  },

  async findById(id: string): Promise<Policy> {
    const res = await apiClient.get<{ data: BackendPolicy }>(`/policies/${id}`)
    return mapPolicy(res.data.data)
  },

  async create(input: PolicyCreateInput): Promise<Policy> {
    const res = await apiClient.post<{ data: BackendPolicy }>('/policies', input)
    return mapPolicy(res.data.data)
  },

  async update(id: string, input: PolicyUpdateInput): Promise<Policy> {
    const res = await apiClient.put<{ data: BackendPolicy }>(`/policies/${id}`, input)
    return mapPolicy(res.data.data)
  },

  // Eliminación total y permanente — no es soft-delete. Borra las líneas de
  // cobertura y sus adjuntos, y desvincula (sin borrarlos) los documentos
  // contables, siniestros y tareas que referenciaban esta póliza.
  async hardDelete(id: string): Promise<void> {
    await apiClient.delete(`/policies/${id}`)
  },

  async markAsDeBaja(id: string): Promise<Policy> {
    const res = await apiClient.post<{ data: BackendPolicy }>(`/policies/${id}/de-baja`)
    return mapPolicy(res.data.data)
  },

  async findCoverages(policyId: string): Promise<PolicyCoverage[]> {
    const res = await apiClient.get<{ data: BackendPolicyCoverage[] }>(`/policies/${policyId}/coverages`)
    return res.data.data.map(mapCoverage)
  },

  async replaceCoverages(policyId: string, coverages: PolicyCoverageInput[]): Promise<PolicyCoverage[]> {
    const res = await apiClient.put<{ data: BackendPolicyCoverage[] }>(`/policies/${policyId}/coverages`, { coverages })
    return res.data.data.map(mapCoverage)
  },

  // Alta de una línea puntual, con fecha de alta propia (Fase 3).
  async addCoverage(policyId: string, input: AddCoverageInput): Promise<PolicyCoverage> {
    const res = await apiClient.post<{ data: BackendPolicyCoverage }>(`/policies/${policyId}/coverages`, input)
    return mapCoverage(res.data.data)
  },

  // Edita los campos de una línea activa (nunca effectiveDate/bajaDate).
  async updateCoverage(policyId: string, coverageId: string, input: Omit<PolicyCoverageInput, 'id'>): Promise<PolicyCoverage> {
    const res = await apiClient.put<{ data: BackendPolicyCoverage }>(`/policies/${policyId}/coverages/${coverageId}`, input)
    return mapCoverage(res.data.data)
  },

  // Baja histórica — nunca borra la línea, sus adjuntos ni sus documentos.
  async deactivateCoverage(policyId: string, coverageId: string, input: DeactivateCoverageInput): Promise<PolicyCoverage> {
    const res = await apiClient.post<{ data: BackendPolicyCoverage }>(`/policies/${policyId}/coverages/${coverageId}/de-baja`, input)
    return mapCoverage(res.data.data)
  },

  // Borrado físico real — solo permitido por el backend si la línea no tiene
  // adjuntos ni asignaciones de documentos (errores de carga sin historial).
  async deleteCoveragePhysical(policyId: string, coverageId: string): Promise<void> {
    await apiClient.delete(`/policies/${policyId}/coverages/${coverageId}`)
  },

  async findAttachments(policyId: string, coverageId: string): Promise<PolicyAttachment[]> {
    const res = await apiClient.get<{ data: PolicyAttachment[] }>(`/policies/${policyId}/coverages/${coverageId}/attachments`)
    return res.data.data
  },

  async addAttachment(
    policyId: string,
    coverageId: string,
    file: File,
    meta: { description?: string; isCirculationCard?: boolean },
  ): Promise<PolicyAttachment> {
    const form = new FormData()
    form.append('file', file)
    if (meta.description) form.append('description', meta.description)
    if (meta.isCirculationCard) form.append('isCirculationCard', 'true')
    const res = await apiClient.post<{ data: PolicyAttachment }>(
      `/policies/${policyId}/coverages/${coverageId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.data
  },

  async deleteAttachment(policyId: string, coverageId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/policies/${policyId}/coverages/${coverageId}/attachments/${attachmentId}`)
  },

  async downloadAttachment(policyId: string, coverageId: string, attachmentId: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/policies/${policyId}/coverages/${coverageId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
    triggerBlobDownload(res.data, filename)
  },

  async findTasks(policyId: string): Promise<ProducerTask[]> {
    const res = await apiClient.get<{ data: BackendTask[] }>(`/policies/${policyId}/tasks`)
    return res.data.data.map(mapTask)
  },

  // Historial completo (como anterior y como renovación), incluidas revertidas.
  async findRenewals(policyId: string): Promise<PolicyRenewalRecord[]> {
    const res = await apiClient.get<{ data: PolicyRenewalRecord[] }>(`/policies/${policyId}/renewals`)
    return res.data.data
  },

  async getRenewalPreview(previousPolicyId: string, renewalPolicyId: string): Promise<PolicyRenewalPreview> {
    const res = await apiClient.get<{ data: PolicyRenewalPreview }>(`/policies/${previousPolicyId}/renewal-preview`, {
      params: { renewalPolicyId },
    })
    return res.data.data
  },

  async createRenewal(previousPolicyId: string, input: { renewalPolicyId?: string; notes?: string } = {}): Promise<PolicyRenewalRecord> {
    const res = await apiClient.post<{ data: PolicyRenewalRecord }>(`/policies/${previousPolicyId}/renewal`, input)
    return res.data.data
  },

  async revokeRenewal(previousPolicyId: string, reason: string): Promise<PolicyRenewalRecord> {
    const res = await apiClient.post<{ data: PolicyRenewalRecord }>(`/policies/${previousPolicyId}/renewal/revoke`, { reason })
    return res.data.data
  },
}

// ── Query keys / query options (categoría B — semi-dinámico) ────────────────────
// El detalle usa la key singular `['policy', id]` (no `['policies', id]`) porque
// es la convención que ya domina en el código (PolicyDetailPage/Edit/Ficha) — se
// mantiene así a propósito para no fragmentar cache con lo ya existente.

type PolicyFilters = { assetId?: string; companyId?: string; producerId?: string; insuranceTypeId?: string; limit?: number; includeCoverages?: boolean }

// Alcance del Dashboard general — el backend aplica el mismo criterio que su
// filtro en memoria (ver policies.service.ts#buildScopeConditions). Las
// empresas viajan separadas por coma.
export interface PolicyScopeFilters {
  scopeCompanyIds?: string
  scopeCostCenterId?: string
  scopeAssetType?: string
}

export type PolicyListFilters = PolicyFilters & ListSortParams & ListSummaryParams & PolicyScopeFilters & {
  page?: number
  search?: string
  // Estado administrativo — el filtro de las pantallas desde R2. `status`
  // (contractual) queda solo por compatibilidad.
  effectiveStatus?: Exclude<PolicyEffectiveStatus, 'desconocido'>
}

// GET /policies?includeSummary=true — sobre todo el resultado filtrado.
// byStatus/byEffectiveStatus usan el vocabulario del backend
// (proxima_a_vencer) e ignoran solo los filtros de estado; la suma asegurada
// es solo de líneas vigentes hoy y no depende de las renovaciones.
export type PolicyEffectiveStatusCounts = {
  vigente: number; proxima_a_vencer: number; renovada: number; vencida: number; de_baja: number
}
// Desglose de la suma asegurada vigente (R4-B) — solo con
// includeInsuredBreakdown=true (Dashboard general). Con filtro de empresa /
// centro de costo los importes vienen prorrateados por las asignaciones de
// cada activo (`attributed`); sin esos filtros son los contractuales.
export interface PolicyInsuredBreakdown {
  attributed: boolean
  byInsurer: { insurer: string; insuredActiveArs: number; insuredActiveUsd: number; policyCount: number }[]
  /** Pólizas con al menos una línea en vigencia efectiva hoy (dentro del alcance). */
  activeCoveragePolicyCount: number
  /** Activos con al menos una línea en vigencia efectiva hoy (dentro del alcance). */
  insuredAssetCount: number
  /** Activos en alcance cuyas asignaciones no suman 100 % (dato a revisar; no se normaliza). */
  allocationIssues: { underAllocatedAssets: number; overAllocatedAssets: number }
  /** IDs para identificar las fichas afectadas sin duplicar la regla del backend. */
  allocationIssueAssetIds?: { underAllocated: string[]; overAllocated: string[] }
  /** Ids de todas las pólizas del alcance (cualquier estado); null sin filtros de alcance. */
  scopePolicyIds: string[] | null
}

export interface PolicyListSummary {
  total: number
  byStatus: { vigente: number; proxima_a_vencer: number; vencida: number; de_baja: number }
  // Opcional: un backend anterior a R2 no lo manda.
  byEffectiveStatus?: PolicyEffectiveStatusCounts
  // Suma asegurada vigente hoy: contractual, o prorrateada si hay filtro de
  // empresa / centro de costo (R4-B).
  insuredActiveArs: number
  insuredActiveUsd: number
  insuredBreakdown?: PolicyInsuredBreakdown
}

export const policyKeys = {
  all: ['policies'] as const,
  list: (filters?: PolicyFilters) => (filters ? ([...policyKeys.all, filters] as const) : policyKeys.all),
  detail: (id: string) => ['policy', id] as const,
  coverages: (id: string) => [...policyKeys.all, id, 'coverages'] as const,
  attachments: (id: string, coverageId: string) => [...policyKeys.all, id, 'coverages', coverageId, 'attachments'] as const,
  tasks: (id: string) => [...policyKeys.all, id, 'tasks'] as const,
  renewals: (id: string) => [...policyKeys.all, id, 'renewals'] as const,
  renewalPreview: (id: string, renewalPolicyId: string) => [...policyKeys.all, id, 'renewal-preview', renewalPolicyId] as const,
}

export const policyQueries = {
  search: (params: PolicySearchParams) =>
    queryOptions({
      queryKey: [...policyKeys.all, 'search', params] as const,
      queryFn: () => policiesApi.search(params),
      staleTime: 60 * 1000,
    }),
  list: (filters?: PolicyFilters) =>
    queryOptions({
      queryKey: policyKeys.list(filters),
      queryFn: () => policiesApi.findAll(filters),
      staleTime: 60 * 1000,
    }),
  listPaginated: (filters: PolicyListFilters) =>
    queryOptions({
      queryKey: [...policyKeys.all, 'paginated', filters] as const,
      queryFn: async (): Promise<PaginatedResult<Policy, PolicyListSummary>> => {
        const res = await apiClient.get<Paginated<BackendPolicy> & { summary?: PolicyListSummary }>('/policies', { params: filters })
        return { data: res.data.data.map(mapPolicy), pagination: res.data.pagination, summary: res.data.summary }
      },
      staleTime: 60 * 1000,
    }),
  // Conteos por estado y suma asegurada vigente (con su desglose) sobre todo
  // el conjunto filtrado (Dashboard general): pide una página de 1 fila y usa
  // el summary del backend — nada depende de una lista paginada.
  statusSummary: (scope: PolicyScopeFilters) =>
    queryOptions({
      queryKey: [...policyKeys.all, 'status-summary', scope] as const,
      queryFn: async (): Promise<PolicyListSummary | undefined> => {
        const res = await apiClient.get<{ summary?: PolicyListSummary }>('/policies', {
          params: { ...scope, limit: 1, includeSummary: true, includeInsuredBreakdown: true },
        })
        return res.data.summary
      },
      staleTime: 60 * 1000,
    }),
  // Todas las pólizas (todas las páginas) — para tableros con totales globales
  // (Dashboard de Seguros), que no pueden quedarse con las primeras 500.
  listAll: (filters?: { includeCoverages?: boolean }) =>
    queryOptions({
      queryKey: [...policyKeys.all, 'all', filters ?? {}] as const,
      queryFn: ({ signal }): Promise<CompleteList<Policy>> =>
        fetchAllPages(async ({ page, limit, signal }) => {
          const res = await apiClient.get<Paginated<BackendPolicy>>('/policies', {
            params: { ...filters, page, limit },
            signal,
          })
          return { data: res.data.data.map(mapPolicy), pagination: res.data.pagination }
        }, signal),
      staleTime: 60 * 1000,
    }),
  // Próximos vencimientos pendientes de gestión de renovación (Vigente o
  // Próxima a vencer, sin renovación registrada), ordenados por vencimiento —
  // dos páginas chicas del servidor en vez de filtrar una lista con tope.
  upcomingPendingRenewals: (scope: PolicyScopeFilters, limit = 6) =>
    queryOptions({
      queryKey: [...policyKeys.all, 'upcoming-pending-renewals', scope, limit] as const,
      queryFn: async (): Promise<Policy[]> => {
        const page = (effectiveStatus: 'proxima_a_vencer' | 'vigente') =>
          apiClient.get<Paginated<BackendPolicy>>('/policies', {
            params: { ...scope, effectiveStatus, sortBy: 'endDate', sortDir: 'asc', limit, page: 1 },
          })
        const [soon, later] = await Promise.all([page('proxima_a_vencer'), page('vigente')])
        return [...soon.data.data, ...later.data.data].map(mapPolicy).slice(0, limit)
      },
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: policyKeys.detail(id),
      queryFn: () => policiesApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  coverages: (id: string) =>
    queryOptions({
      queryKey: policyKeys.coverages(id),
      queryFn: () => policiesApi.findCoverages(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  attachments: (id: string, coverageId: string) =>
    queryOptions({
      queryKey: policyKeys.attachments(id, coverageId),
      queryFn: () => policiesApi.findAttachments(id, coverageId),
      staleTime: 2 * 60 * 1000,
      enabled: !!id && !!coverageId,
    }),
  tasks: (id: string) =>
    queryOptions({
      queryKey: policyKeys.tasks(id),
      queryFn: () => policiesApi.findTasks(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
  renewals: (id: string) =>
    queryOptions({
      queryKey: policyKeys.renewals(id),
      queryFn: () => policiesApi.findRenewals(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
  // Sin cache: la vista previa tiene que reflejar el estado actual al
  // momento de confirmar (el backend igual revalida todo al registrar).
  renewalPreview: (id: string, renewalPolicyId: string) =>
    queryOptions({
      queryKey: policyKeys.renewalPreview(id, renewalPolicyId),
      queryFn: () => policiesApi.getRenewalPreview(id, renewalPolicyId),
      staleTime: 0,
      gcTime: 0,
      retry: false,
      enabled: !!id && !!renewalPolicyId,
    }),
}
