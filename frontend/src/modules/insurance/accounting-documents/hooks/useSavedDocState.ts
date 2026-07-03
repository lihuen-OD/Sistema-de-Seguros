import { useState } from 'react'

// Estado compartido de "guardado en curso" por los 6 formularios de
// documentos. En modo creación arranca vacío; en modo edición arranca ya
// guardado con el id existente. A partir de ahí, crear y editar convergen en
// el mismo flujo: mientras no haya savedDocId, "Guardar" crea; una vez que
// existe, "Guardar" pasa a actualizar en el mismo documento.
export function useSavedDocState(initialDocId?: string) {
  const [savedDocId, setSavedDocId] = useState<string | null>(initialDocId ?? null)
  const [isSaved, setIsSaved] = useState(!!initialDocId)

  const markUnsaved = () => {
    if (isSaved) setIsSaved(false)
  }

  const markSaved = (id: string) => {
    setSavedDocId(id)
    setIsSaved(true)
  }

  return { savedDocId, isSaved, markUnsaved, markSaved }
}
