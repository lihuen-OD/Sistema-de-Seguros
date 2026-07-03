import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { documentsApi } from '../../../shared/api/documents.api'
import { DocumentTypePicker } from './forms/DocumentTypePicker'
import { DocumentFormRouter } from './forms/DocumentFormRouter'
import type { DocumentType } from '../../../shared/types'

// Página de entrada para crear un documento contable. El tipo se elige una
// sola vez (acá o vía el shortcut "Nuevo documento" de una póliza) y a partir
// de ahí queda fijo — cada tipo tiene su propio formulario dedicado, ver
// DocumentFormRouter.
export default function DocumentNewPage() {
  const [searchParams] = useSearchParams()
  const fromPolicyId = searchParams.get('policyId') ?? ''
  // El shortcut "Nuevo documento" desde una póliza siempre crea una Factura.
  const [selectedType, setSelectedType] = useState<DocumentType | null>(fromPolicyId ? 'INVOICE' : null)

  const { data: documentTypesData, isLoading } = useQuery({
    queryKey: ['documents', 'types'],
    queryFn: () => documentsApi.getTypes(),
  })

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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

  return (
    <DocumentFormRouter
      documentType={selectedType}
      sourcePolicyId={selectedType === 'INVOICE' ? fromPolicyId || undefined : undefined}
    />
  )
}
