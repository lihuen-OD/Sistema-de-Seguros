import { ROUTES } from '../../app/routes'
import { hasModule } from '../../app/auth/roleScope'
import { DOCUMENT_TYPE_LABELS } from '../constants'
import { assetInternalCode } from './assetCode'
import { formatCurrencyFull, formatDate } from './format'
import type { CurrentUser } from '../api/auth.api'
import type { GlobalSearchResults } from '../api/search.api'
import type { ModuleKey } from '../types'

// Reglas del buscador global del Topbar — mismas cotas que valida el backend
// (search.schemas.ts): por debajo de 2 caracteres no se consulta.
export const GLOBAL_SEARCH_MIN_LENGTH = 2
export const GLOBAL_SEARCH_MAX_LENGTH = 100
export const GLOBAL_SEARCH_DEBOUNCE_MS = 300

export type GlobalSearchCategory = 'assets' | 'policies' | 'documents'

// Cada categoría con el módulo que exige su detalle — el mismo criterio que
// aplica el backend (search.service.ts#canSearch) para devolver el grupo.
export const GLOBAL_SEARCH_CATEGORIES: ReadonlyArray<{ key: GlobalSearchCategory; module: ModuleKey; label: string; noun: string }> = [
  { key: 'assets', module: 'assets', label: 'Activos', noun: 'activos' },
  { key: 'policies', module: 'policies', label: 'Pólizas', noun: 'pólizas' },
  { key: 'documents', module: 'documents', label: 'Documentos', noun: 'documentos' },
]

// Solo es UX (placeholder y ocultar el buscador sin permisos): el backend
// vuelve a exigir el módulo de cada grupo.
export function globalSearchCategoriesFor(user: CurrentUser | null): GlobalSearchCategory[] {
  return GLOBAL_SEARCH_CATEGORIES.filter((c) => hasModule(user, c.module)).map((c) => c.key)
}

export function normalizeGlobalSearchQuery(raw: string): string {
  return raw.trim()
}

export function canRunGlobalSearch(query: string): boolean {
  return query.length >= GLOBAL_SEARCH_MIN_LENGTH && query.length <= GLOBAL_SEARCH_MAX_LENGTH
}

export function buildGlobalSearchPlaceholder(categories: GlobalSearchCategory[]): string {
  const nouns = GLOBAL_SEARCH_CATEGORIES.filter((c) => categories.includes(c.key)).map((c) => c.noun)
  const last = nouns.pop()
  return `Buscar ${nouns.length > 0 ? `${nouns.join(', ')} y ${last}` : last ?? ''}…`
}

export interface GlobalSearchEntry {
  key: string
  category: GlobalSearchCategory
  href: string
  title: string
  subtitle: string
  /** Clave de StatusPill (estado del activo, estado efectivo de la póliza o del documento). */
  status: string
}

export interface GlobalSearchSection {
  category: GlobalSearchCategory
  label: string
  hasMore: boolean
  entries: GlobalSearchEntry[]
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' · ')
}

function buildEntries(category: GlobalSearchCategory, results: GlobalSearchResults): GlobalSearchEntry[] {
  switch (category) {
    case 'assets':
      return (results.assets?.items ?? []).map((asset) => ({
        key: `assets:${asset.id}`,
        category,
        href: ROUTES.ASSETS_DETAIL(asset.id),
        title: asset.name,
        subtitle: joinParts([assetInternalCode(asset), asset.plate, asset.fixedAssetName]),
        status: asset.status,
      }))
    case 'policies':
      return (results.policies?.items ?? []).map((policy) => ({
        key: `policies:${policy.id}`,
        category,
        href: ROUTES.POLICIES_DETAIL(policy.id),
        title: policy.policyNumber,
        subtitle: joinParts([
          policy.insuranceCompany,
          policy.insuranceTypeNames.join(', '),
          `Vence ${formatDate(policy.endDate)}`,
        ]),
        status: policy.effectiveStatus,
      }))
    case 'documents':
      return (results.documents?.items ?? []).map((doc) => ({
        key: `documents:${doc.id}`,
        category,
        href: ROUTES.DOCUMENTS_DETAIL(doc.id),
        title: `${DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} ${doc.documentNumber}`,
        subtitle: joinParts([doc.insuranceCompany, formatDate(doc.issueDate), formatCurrencyFull(doc.totalAmount, doc.currency)]),
        // Un anulado se marca como tal — su estado de pago ya no es lo relevante.
        status: doc.documentStatus === 'CANCELLED' ? 'CANCELLED' : doc.paymentStatus,
      }))
  }
}

// Secciones en orden fijo (Activos, Pólizas, Documentos); se omiten las que
// el backend no devolvió (sin permiso) o que vinieron vacías.
export function buildGlobalSearchSections(results: GlobalSearchResults): GlobalSearchSection[] {
  return GLOBAL_SEARCH_CATEGORIES.flatMap(({ key, label }) => {
    const entries = buildEntries(key, results)
    if (entries.length === 0) return []
    return [{ category: key, label, hasMore: results[key]?.hasMore ?? false, entries }]
  })
}

// Orden de navegación con flechas: el mismo en que se ven las filas.
export function flattenGlobalSearchSections(sections: GlobalSearchSection[]): GlobalSearchEntry[] {
  return sections.flatMap((section) => section.entries)
}
