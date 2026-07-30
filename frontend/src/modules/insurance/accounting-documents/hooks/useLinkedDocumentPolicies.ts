import { useQueries } from '@tanstack/react-query'
import { policyQueries } from '../../../../shared/api/policies.api'
import type { AccountingDocument, Policy } from '../../../../shared/types'

// Resuelve las pólizas (con `.coverages` poblado) cubiertas por un documento
// vinculado, para poder repartir el importe de ND/Ajuste/NC/Endoso entre los
// activos que esa factura ya cubre — mismo patrón que ya usaba
// DocumentoFacturaForm para sus propias pólizas, extraído acá para reusar en
// los formularios que reparten sobre la póliza de OTRO documento (la factura
// asociada) en vez de sobre una elegida directamente.
// `policyIds` viene denormalizado en AccountingDocument (ver
// documents.api.ts#mapDocument), así que no hace falta resolverlo a mano.
export function useLinkedDocumentPolicies(linkedDocument: AccountingDocument | null | undefined): Policy[] {
  const policyIds = linkedDocument?.policyIds ?? []
  const queries = useQueries({
    queries: policyIds.map((id) => ({ ...policyQueries.detail(id) })),
  })
  return queries.map((q) => q.data).filter((p): p is Policy => !!p)
}
