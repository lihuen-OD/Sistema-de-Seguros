import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Columns3, GripVertical, RotateCcw, X } from 'lucide-react'
import type { TableColumn } from '../../types'

interface ColumnConfig {
  id: string
  visible: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: TableColumn<any>
}

interface Props {
  columnConfigs: ColumnConfig[]
  onToggle: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
  onReset: () => void
}

function SortableRow({
  config,
  onToggle,
}: {
  config: ColumnConfig
  onToggle: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: config.id,
    disabled: config.column.hideable === false,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isFixed = config.column.hideable === false

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
        isDragging ? 'bg-blue-50 shadow-sm' : 'hover:bg-slate-50'
      } ${isFixed ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        className={`flex-shrink-0 text-slate-300 ${isFixed ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:text-slate-500'}`}
        {...(isFixed ? {} : { ...attributes, ...listeners })}
        tabIndex={-1}
      >
        <GripVertical size={14} />
      </button>

      <button
        type="button"
        role="checkbox"
        aria-checked={config.visible}
        onClick={() => !isFixed && onToggle(config.id)}
        disabled={isFixed}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          isFixed
            ? 'border-slate-200 bg-slate-100 cursor-not-allowed'
            : config.visible
              ? 'border-blue-600 bg-blue-600 hover:bg-blue-700'
              : 'border-slate-300 bg-white hover:border-blue-400'
        }`}
      >
        {(config.visible || isFixed) && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <span className={`text-sm flex-1 ${isFixed ? 'text-slate-400 italic' : config.visible ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
        {config.column.label}
        {isFixed && <span className="ml-1 text-xs">(fijo)</span>}
      </span>
    </div>
  )
}

export function ColumnConfigButton({ columnConfigs, onToggle, onReorder, onReset }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id))
    }
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const visibleCount = columnConfigs.filter((c) => c.visible && c.column.hideable !== false).length

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
          open
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
        }`}
        title="Configurar columnas"
      >
        <Columns3 size={14} />
        <span className="hidden sm:inline">Columnas</span>
        {visibleCount > 0 && (
          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full leading-none">
            {visibleCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          style={{ width: 240 }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Columnas visibles</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <div className="py-1 max-h-80 overflow-y-auto px-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={columnConfigs.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {columnConfigs.map((config) => (
                  <SortableRow key={config.id} config={config} onToggle={onToggle} />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <RotateCcw size={11} />
              Restablecer por defecto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
