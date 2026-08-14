import { useState } from 'react'

// Selección de filas para "aprobar en bloque" en las 3 colas de auditoría
// (Matafuegos/Rodados/Seguros) — solo lo pendiente de revisión (SUBMITTED) se
// puede tildar, no tiene sentido "aprobar en bloque" algo ya decidido.
// `filteredRows` es la lista YA filtrada por búsqueda/estado/fecha de cada
// página — toggleAll selecciona sobre lo visible, no sobre el total.
export function useAuditSelection<T extends { id: string; status: string }>(filteredRows: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function isRowSelectable(row: T) {
    return row.status === 'SUBMITTED'
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filteredRows.filter(isRowSelectable).map((r) => r.id)) : new Set())
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  return { selectedIds, setSelectedIds, isRowSelectable, toggleOne, toggleAll, clearSelection }
}
