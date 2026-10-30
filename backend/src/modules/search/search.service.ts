import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { ModuleKey, RequestUser } from '../../shared/types'
import {
  ASSET_SEARCH_SELECT,
  buildAssetExactMatchWhere,
  buildAssetSearchWhere,
  isAssetExactMatch,
  mapAssetSearchResult,
} from '../assets/asset-search'
import {
  POLICY_SEARCH_ORDER_BY,
  POLICY_SEARCH_SELECT,
  buildPolicyExactMatchWhere,
  buildPolicySearchWhere,
  isPolicyExactMatch,
  mapPolicySearchResult,
} from '../policies/policy-search'
import {
  DOCUMENT_SEARCH_SELECT,
  buildDocumentExactMatchWhere,
  buildDocumentSearchWhere,
  isDocumentExactMatch,
  mapDocumentSearchResult,
} from '../documents/document-search'
import type { GlobalSearchQueryDTO } from './search.schemas'

export interface GlobalSearchGroup<T> {
  items: T[]
  hasMore: boolean
}

// Cada grupo se exige con el mismo módulo que su pantalla de detalle
// (GET /assets/:id, /policies/:id, /documents/:id) — no con el de los
// selectores de formulario, que son más amplios (ej. /assets/search también
// acepta `policies`): un resultado que el usuario no puede abrir no se muestra.
// Activos/pólizas/documentos no tienen alcance por establecimiento
// (UserAuditScope es solo de los dominios de auditoría), así que el módulo
// es toda la regla — la misma que ya aplica el detalle.
function canSearch(user: RequestUser, module: ModuleKey): boolean {
  return user.role === 'ADMIN' || user.modules.includes(module)
}

// Coincidencias exactas de identificador primero, después las parciales.
// Se pide un resultado de más (limit + 1) para saber si hay más sin un
// count(). Si las parciales no llegan a desbordar el límite, ya incluyen
// todas las exactas (cada condición exacta es un caso particular de la
// parcial) y alcanza con reordenarlas en memoria; solo si desbordan se hace
// una segunda consulta acotada, porque una exacta podría haber quedado fuera
// del primer lote.
async function rankedGroup<Where, Row extends { id: string }, Item>(params: {
  limit: number
  partialWhere: Where
  exactWhere: Where
  find: (where: Where, take: number) => Promise<Row[]>
  isExact: (row: Row) => boolean
  map: (row: Row) => Item
}): Promise<GlobalSearchGroup<Item>> {
  const { limit, partialWhere, exactWhere, find, isExact, map } = params
  const partial = await find(partialWhere, limit + 1)
  const hasMore = partial.length > limit
  const exact = hasMore ? await find(exactWhere, limit) : partial.filter(isExact)
  const exactIds = new Set(exact.map((row) => row.id))
  const rows = [...exact, ...partial.filter((row) => !exactIds.has(row.id))].slice(0, limit)
  return { items: rows.map(map), hasMore }
}

// A diferencia del selector, incluye los activos dados de baja (el detalle
// los sigue mostrando) — primero los activos, después los de baja.
const GLOBAL_ASSET_SELECT = {
  ...ASSET_SEARCH_SELECT,
  serialNumber: true,
  licensePlateNormalized: true,
} satisfies Prisma.AssetSelect

const GLOBAL_ASSET_ORDER_BY: Prisma.AssetOrderByWithRelationInput[] = [
  { isActive: 'desc' },
  { name: 'asc' },
  { code: 'asc' },
]

function searchAssets(q: string, limit: number) {
  return rankedGroup({
    limit,
    partialWhere: buildAssetSearchWhere(q),
    exactWhere: buildAssetExactMatchWhere(q),
    find: (where, take) =>
      prisma.asset.findMany({ where, select: GLOBAL_ASSET_SELECT, orderBy: GLOBAL_ASSET_ORDER_BY, take }),
    isExact: (row) => isAssetExactMatch(row, q),
    map: mapAssetSearchResult,
  })
}

function searchPolicies(q: string, limit: number) {
  return rankedGroup({
    limit,
    partialWhere: buildPolicySearchWhere(q),
    exactWhere: buildPolicyExactMatchWhere(q),
    find: (where, take) =>
      prisma.policy.findMany({ where, select: POLICY_SEARCH_SELECT, orderBy: POLICY_SEARCH_ORDER_BY, take }),
    isExact: (row) => isPolicyExactMatch(row, q),
    map: mapPolicySearchResult,
  })
}

// Incluye los anulados; documentStatus viaja solo en esta respuesta (no en
// la del selector) para que el panel muestre el estado.
const GLOBAL_DOCUMENT_SELECT = {
  ...DOCUMENT_SEARCH_SELECT,
  documentStatus: true,
} satisfies Prisma.AccountingDocumentSelect

function searchDocuments(q: string, limit: number) {
  return rankedGroup({
    limit,
    partialWhere: buildDocumentSearchWhere(q),
    exactWhere: buildDocumentExactMatchWhere(q),
    find: (where, take) =>
      prisma.accountingDocument.findMany({
        where,
        select: GLOBAL_DOCUMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        take,
      }),
    isExact: (row) => isDocumentExactMatch(row, q),
    map: (row) => ({ ...mapDocumentSearchResult(row), documentStatus: row.documentStatus }),
  })
}

export const searchService = {
  // Los grupos sin permiso no se consultan ni viajan en la respuesta.
  async search(user: RequestUser, query: GlobalSearchQueryDTO) {
    const { q, limit } = query
    const [assets, policies, documents] = await Promise.all([
      canSearch(user, 'assets') ? searchAssets(q, limit) : undefined,
      canSearch(user, 'policies') ? searchPolicies(q, limit) : undefined,
      canSearch(user, 'documents') ? searchDocuments(q, limit) : undefined,
    ])
    return {
      ...(assets && { assets }),
      ...(policies && { policies }),
      ...(documents && { documents }),
    }
  },
}
