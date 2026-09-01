import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

// Paginador real, genérico — puramente presentacional/controlado: no sabe
// nada de auditorías, de backend, ni de cómo se pidieron los datos. Solo
// refleja `page`/`limit`/`total`/`totalPages` (mismo shape que ya devuelve
// buildPaginatedResponse en el backend — pensado para poder pasarle el
// objeto `pagination` de la respuesta casi tal cual) y notifica el cambio de
// página vía `onPageChange`; quien lo use decide qué hacer con eso (pedir la
// página nueva, actualizar estado, etc.).
export interface PaginationControlsProps {
  page: number
  limit: number
  total: number
  totalPages: number
  /** Deshabilita los botones de navegación y muestra un indicador chico
   *  mientras se está pidiendo una página nueva — no renderiza un loading
   *  state propio (eso lo maneja la tabla), solo evita doble clic. */
  isLoading?: boolean
  onPageChange: (page: number) => void
  className?: string
}

export function PaginationControls({
  page,
  limit,
  total,
  totalPages,
  isLoading = false,
  onPageChange,
  className,
}: PaginationControlsProps) {
  // Sin resultados no hay nada que paginar — mostrar "Página 1 de 0" o
  // "Mostrando 0–0 de 0" se vería roto. El estado vacío en sí lo maneja la
  // tabla (EmptyState), no este componente.
  if (total === 0) return null

  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const canGoPrev = page > 1 && !isLoading
  const canGoNext = page < totalPages && !isLoading

  const navButtonClass =
    'flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 bg-white ' +
    'hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white'

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 ${className ?? ''}`}>
      <span className="text-xs text-slate-400 whitespace-nowrap">
        Mostrando {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={!canGoPrev} className={navButtonClass}>
          <ChevronLeft size={14} />
          Anterior
        </button>
        <span className="flex items-center gap-1.5 px-1 text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {isLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
          Página {page} de {totalPages}
        </span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={!canGoNext} className={navButtonClass}>
          Siguiente
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
