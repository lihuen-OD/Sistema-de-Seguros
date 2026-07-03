import { Paperclip } from 'lucide-react'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { DocumentAttachmentsSection } from '../DocumentAttachmentsSection'

interface DocumentAttachmentsCardProps {
  isSaved: boolean
  savedDocId: string | null
}

export function DocumentAttachmentsCard({ isSaved, savedDocId }: DocumentAttachmentsCardProps) {
  return (
    <SectionCard
      title="Documentación Adjunta"
      subtitle={isSaved ? 'Podés agregar o quitar archivos adjuntos' : 'Guardá el documento primero para adjuntar archivos'}
      noPadding
    >
      {isSaved && savedDocId ? (
        <DocumentAttachmentsSection documentId={savedDocId} />
      ) : (
        <div className="px-5 py-8 text-center">
          <Paperclip size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Guardá el documento para adjuntar la factura PDF u otros archivos</p>
        </div>
      )}
    </SectionCard>
  )
}
