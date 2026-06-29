import { useState, useMemo, useCallback } from 'react'
import type { TableColumn } from '../types'

interface ColumnState {
  id: string
  visible: boolean
  order: number
}

function colId<T>(col: TableColumn<T>): string {
  return col.id ?? String(col.key)
}

export function useColumnConfig<T extends object>(
  tableKey: string,
  allColumns: TableColumn<T>[],
) {
  const storageKey = `col-config:${tableKey}`

  const [states, setStates] = useState<ColumnState[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed: ColumnState[] = JSON.parse(saved)
        // Merge saved states with allColumns in case new columns were added
        const savedMap = new Map(parsed.map((s) => [s.id, s]))
        return allColumns.map((col, idx) => {
          const id = colId(col)
          const saved = savedMap.get(id)
          return saved ?? { id, visible: col.defaultVisible !== false, order: idx }
        }).sort((a, b) => a.order - b.order)
      }
    } catch {
      // ignore corrupt localStorage
    }
    return allColumns.map((col, idx) => ({
      id: colId(col),
      visible: col.defaultVisible !== false,
      order: idx,
    }))
  })

  const persist = useCallback((next: ColumnState[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* noop */ }
    setStates(next)
  }, [storageKey])

  const toggle = useCallback((id: string) => {
    setStates((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, visible: !s.visible } : s)
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [storageKey])

  const reorder = useCallback((activeId: string, overId: string) => {
    setStates((prev) => {
      const activeIdx = prev.findIndex((s) => s.id === activeId)
      const overIdx = prev.findIndex((s) => s.id === overId)
      if (activeIdx === -1 || overIdx === -1 || activeIdx === overIdx) return prev
      const next = [...prev]
      const [moved] = next.splice(activeIdx, 1)
      next.splice(overIdx, 0, moved)
      const reindexed = next.map((s, i) => ({ ...s, order: i }))
      try { localStorage.setItem(storageKey, JSON.stringify(reindexed)) } catch { /* noop */ }
      return reindexed
    })
  }, [storageKey])

  const reset = useCallback(() => {
    const defaults = allColumns.map((col, idx) => ({
      id: colId(col),
      visible: col.defaultVisible !== false,
      order: idx,
    }))
    persist(defaults)
  }, [allColumns, persist])

  const applyPreset = useCallback((columnIds: string[]) => {
    const presetSet = new Set(columnIds)
    setStates((prev) => {
      const colById = new Map(allColumns.map((c) => [colId(c), c]))
      const next = prev.map((s) => ({
        ...s,
        // Fixed columns (hideable === false, e.g. actions) stay always visible
        visible: colById.get(s.id)?.hideable === false ? true : presetSet.has(s.id),
      }))
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [storageKey, allColumns])

  const colMap = useMemo(
    () => new Map(allColumns.map((c) => [colId(c), c])),
    [allColumns],
  )

  // visibleColumns in user-defined order, actions column always last
  const visibleColumns = useMemo(() => {
    const sorted = [...states].sort((a, b) => a.order - b.order)
    const visible = sorted
      .filter((s) => s.visible)
      .map((s) => colMap.get(s.id))
      .filter((c): c is TableColumn<T> => !!c)
    // ensure non-hideable columns (actions) are always last
    const normal = visible.filter((c) => c.hideable !== false)
    const fixed = visible.filter((c) => c.hideable === false)
    return [...normal, ...fixed]
  }, [states, colMap])

  // full list (visible + hidden) ordered for the config panel
  const columnConfigs = useMemo(() => {
    return [...states]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s, column: colMap.get(s.id)! }))
      .filter((s) => s.column)
  }, [states, colMap])

  return { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset }
}
