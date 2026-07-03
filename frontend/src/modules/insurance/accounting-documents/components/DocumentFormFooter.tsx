import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, X, CheckCircle2, Info } from 'lucide-react'
import { ConfirmDialog } from '../../../../shared/components/dialogs/ConfirmDialog'

interface DocumentFormFooterProps {
  isSubmitting: boolean
  isSaved: boolean
  savedDocId: string | null
  children?: React.ReactNode
}

// Botones Guardar/Cancelar + badges de estado + diálogo de confirmación,
// compartidos por los 6 formularios de documentos (extraído de la versión
// genérica anterior de DocumentNewPage). `children` permite insertar botones
// adicionales específicos de un tipo (ej. "Enviar por mail" en Factura) antes
// del botón Cancelar.
export function DocumentFormFooter({ isSubmitting, isSaved, savedDocId, children }: DocumentFormFooterProps) {
  const navigate = useNavigate()
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-3 pt-2 pb-6 flex-wrap">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save size={15} />
          {isSubmitting ? 'Guardando…' : savedDocId ? 'Guardar cambios' : 'Guardar Documento'}
        </button>

        {children}

        <button
          type="button"
          onClick={() => {
            // Ya guardado y sin cambios pendientes: no hay nada que descartar,
            // así que se vuelve directo sin pedir confirmación.
            if (savedDocId && isSaved) {
              navigate('/insurance/documents')
              return
            }
            setCancelConfirmOpen(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
        >
          <X size={15} />
          {savedDocId && isSaved ? 'Volver a documentos' : 'Cancelar'}
        </button>

        {isSaved && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 size={14} />
            Guardado
          </span>
        )}
        {savedDocId && !isSaved && !isSubmitting && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <Info size={14} />
            Cambios sin guardar
          </span>
        )}
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        title={savedDocId ? '¿Salir sin guardar los cambios?' : '¿Cancelar la creación?'}
        description={
          savedDocId
            ? 'El documento ya guardado no se elimina, pero los cambios que hiciste después de guardarlo se van a perder.'
            : 'Si salís ahora, perderás todos los datos ingresados. Esta acción no se puede deshacer.'
        }
        confirmLabel={savedDocId ? 'Salir sin guardar' : 'Sí, descartar'}
        cancelLabel="Seguir editando"
        onConfirm={() => navigate('/insurance/documents')}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </>
  )
}
