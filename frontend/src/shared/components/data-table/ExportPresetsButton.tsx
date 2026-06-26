import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Download, Trash2, Check, X, Plus, ChevronDown } from 'lucide-react'
import { downloadCSV, buildExportRows } from '../../utils/export'
import { useExportPresets } from '../../hooks/useExportPresets'
import type { TableColumn } from '../../types'

interface Props<T> {
  tableKey: string
  allColumns: TableColumn<T>[]
  visibleColumns: TableColumn<T>[]
  filteredRows: T[]
  filenamePrefix: string
}

export function ExportPresetsButton<T>({
  tableKey,
  allColumns,
  visibleColumns,
  filteredRows,
  filenamePrefix,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [savingName, setSavingName] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { presets, savePreset, deletePreset } = useExportPresets(tableKey)

  const colMap = new Map(allColumns.map((c) => [c.id ?? String(c.key), c]))

  const exportableVisible = visibleColumns.filter((c) => c.hideable !== false)

  function doExport(columns: TableColumn<T>[]) {
    if (columns.length === 0) return
    const rows = buildExportRows(filteredRows, columns)
    const date = new Date().toISOString().slice(0, 10)
    downloadCSV(rows, `${filenamePrefix}-${date}.csv`)
    setOpen(false)
  }

  function handleExportVisible() {
    doExport(exportableVisible)
  }

  function handleExportPreset(columnIds: string[]) {
    const cols = columnIds.map((id) => colMap.get(id)).filter((c): c is TableColumn<T> => !!c)
    doExport(cols)
  }

  function handleSave() {
    if (!savingName?.trim()) return
    savePreset(savingName.trim(), exportableVisible.map((c) => c.id ?? String(c.key)))
    setSavingName(null)
  }

  function handleSaveKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setSavingName(null)
  }

  useEffect(() => {
    if (savingName !== null && inputRef.current) {
      inputRef.current.focus()
    }
  }, [savingName])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setSavingName(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { setOpen((v) => !v); setSavingName(null) }}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
          open
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
        }`}
        title="Exportar CSV"
      >
        <Download size={14} />
        <span className="hidden sm:inline">Exportar</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg"
          style={{ width: 268 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Exportar CSV</p>
            <button
              type="button"
              onClick={() => { setOpen(false); setSavingName(null) }}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Export visible columns */}
          <div className="px-1 py-1 border-b border-slate-100">
            <button
              type="button"
              onClick={handleExportVisible}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
            >
              <Download size={13} className="text-slate-400 flex-shrink-0" />
              <span>Exportar columnas visibles</span>
              <span className="ml-auto text-xs text-slate-400">{exportableVisible.length} cols</span>
            </button>
          </div>

          {/* Saved presets */}
          <div className="py-1 border-b border-slate-100">
            {presets.length === 0 ? (
              <p className="text-xs text-slate-400 px-4 py-2">Sin formatos guardados</p>
            ) : (
              presets.map((preset) => {
                const colNames = preset.columnIds
                  .map((id) => colMap.get(id)?.label)
                  .filter(Boolean) as string[]
                return (
                  <div
                    key={preset.id}
                    className="relative flex items-center gap-1 px-2 py-1 mx-1 rounded-lg hover:bg-slate-50 group"
                  >
                    {/* Tooltip */}
                    <div
                      className="pointer-events-none absolute bottom-full left-2 mb-1.5 z-50
                                 hidden group-hover:block
                                 bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5
                                 shadow-lg leading-relaxed max-w-[230px] whitespace-normal"
                    >
                      <p className="font-medium text-slate-300 mb-0.5">{preset.name}</p>
                      <p className="text-slate-100">{colNames.join(' · ')}</p>
                      {/* Arrow */}
                      <span
                        className="absolute top-full left-4 border-4 border-transparent border-t-slate-800"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExportPreset(preset.columnIds)}
                      className="flex-1 text-left flex items-center gap-2 min-w-0"
                    >
                      <Download size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{preset.name}</span>
                      <span className="text-xs text-slate-400 whitespace-nowrap ml-auto mr-1">
                        {colNames.length} cols
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deletePreset(preset.id) }}
                      className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Eliminar formato"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Save current format */}
          <div className="px-1 py-1">
            {savingName === null ? (
              <button
                type="button"
                onClick={() => setSavingName('')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left"
              >
                <Plus size={13} className="text-slate-400" />
                Guardar formato actual...
              </button>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={handleSaveKeyDown}
                  placeholder="Nombre del formato…"
                  className="flex-1 min-w-0 text-sm px-2 py-1 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!savingName.trim()}
                  className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  title="Guardar"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setSavingName(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
                  title="Cancelar"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
