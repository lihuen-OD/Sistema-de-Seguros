import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { documentQueries } from '../../../shared/api/documents.api'
import { DocumentTypePicker } from './forms/DocumentTypePicker'
import { DocumentFormRouter } from './forms/DocumentFormRouter'
import type { DocumentType } from '../../../shared/types'

// Página de entrada para crear un documento contable. El tipo se elige una
// sola vez (acá, vía el shortcut de una póliza, o vía "Crear documento
// relacionado" desde una Factura) y a partir de ahí queda fijo — cada tipo
// tiene su propio formulario dedicado, ver DocumentFormRouter.
export default function DocumentNewPage() {
  const [searchParams] = useSearchParams()
  const fromPolicyId = searchParams.get('policyId') ?? ''
  const fromLinkedDocumentId = searchParams.get('linkedDocumentId') ?? ''
  const typeParam = searchParams.get('type') as DocumentType | null
  // Compatibilidad: un link viejo con `policyId` y sin `type` sigue creando
  // Factura, exactamente como antes — los accesos nuevos (menú de la póliza,
  // "Crear documento relacionado" de una Factura) siempre mandan `type`
  // explícito, así que este fallback solo cubre URLs ya existentes.
  const [selectedType, setSelectedType] = useState<DocumentType | null>(typeParam ?? (fromPolicyId ? 'INVOICE' : null))

  const { data: documentTypesData, isLoading } = useQuery(documentQueries.types())

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageContent>
    )
  }

  if (!selectedType) {
    return (
      <DocumentTypePicker
        documentTypes={documentTypesData?.types ?? []}
        onSelect={setSelectedType}
      />
    )
  }

  const isPolicySourced = selectedType === 'INVOICE' || selectedType === 'ENDORSEMENT'
  const isLinkedDocumentSourced = selectedType === 'CREDIT_NOTE' || selectedType === 'DEBIT_NOTE' || selectedType === 'ADJUSTMENT_ENTRY'

  return (
    <DocumentFormRouter
      documentType={selectedType}
      sourcePolicyId={isPolicySourced ? fromPolicyId || undefined : undefined}
      sourceLinkedDocumentId={isLinkedDocumentSourced ? fromLinkedDocumentId || undefined : undefined}
    />
  )
}
