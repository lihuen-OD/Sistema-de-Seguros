import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { documentsApi } from '../../../shared/api/documents.api'
import { DocumentFormRouter } from './forms/DocumentFormRouter'

// El tipo de documento es fijo una vez creado (igual que documentNumber) —
// esta página solo carga el documento y delega en el formulario dedicado a
// su tipo, ver DocumentFormRouter.
export default function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()

  const { data: doc, isLoading } = useQuery({
    queryKey: ['documents', id],
    queryFn: () => documentsApi.findById(id!),
    enabled: !!id,
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

  if (!doc) {
    return (
      <PageContent>
        <EmptyState
          title="Documento no encontrado"
          description="El documento solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  return <DocumentFormRouter documentType={doc.documentType} initialDoc={doc} />
}
