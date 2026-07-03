import type { DocumentType } from '../../../shared/types'

// Espejo de ENDORSEMENT_ALLOWED_LINKED_TYPES en
// backend/src/modules/documents/document-types.ts — el backend es la fuente
// de verdad y vuelve a validar esto; acá solo se usa para filtrar el selector.
export const ENDORSEMENT_ALLOWED_LINKED_TYPES: Record<string, DocumentType[]> = {
  INCREASES_COST: ['INVOICE', 'DEBIT_NOTE'],
  DECREASES_COST: ['CREDIT_NOTE'],
}
