import { useState, useCallback } from 'react'
import type { ExportPreset } from '../types'

function genId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}

export function useExportPresets(tableKey: string) {
  const storageKey = `export-presets:${tableKey}`

  const [presets, setPresets] = useState<ExportPreset[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as ExportPreset[]
    } catch {
      // ignore corrupt localStorage
    }
    return []
  })

  const persist = useCallback((next: ExportPreset[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* noop */ }
    setPresets(next)
  }, [storageKey])

  const savePreset = useCallback((name: string, columnIds: string[]) => {
    persist([...presets, { id: genId(), name: name.trim(), columnIds }])
  }, [presets, persist])

  const deletePreset = useCallback((id: string) => {
    persist(presets.filter((p) => p.id !== id))
  }, [presets, persist])

  return { presets, savePreset, deletePreset }
}
