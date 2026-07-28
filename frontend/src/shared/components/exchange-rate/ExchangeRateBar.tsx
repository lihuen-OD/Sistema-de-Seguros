import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Check, X, Pencil, ArrowLeftRight } from 'lucide-react'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import { exchangeRateApi, exchangeRateQueries } from '../../api/exchange-rate.api'
import { formatDate } from '../../utils/format'

// Widget compartido de tipo de cambio de referencia — usado en Análisis
// Financiero y Análisis Económico. Deliberadamente separado (con su propio
// fondo/borde) de cualquier tabla o total: solo sirve para prellenar el tipo
// de cambio al cargar una póliza/documento/cuota/activo NUEVO — nunca
// recalcula montos ya guardados, que quedan cerrados en ambas monedas con el
// tipo de cambio que tenían en su propio momento. Si el usuario tiene permiso
// module_config, permite actualizarlo ahí mismo.
export function ExchangeRateBar() {
  const { user } = useCurrentUser()
  const canEdit = user?.role === 'ADMIN' || (user?.modules.includes('module_config') ?? false)
  const queryClient = useQueryClient()
  const { data: current, isLoading } = useQuery(exchangeRateQueries.current())
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const mutation = useMutation({
    mutationFn: (rate: number) => exchangeRateApi.setCurrent(rate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeRateQueries.current().queryKey })
      setEditing(false)
    },
  })

  function openEdit() {
    setValue(current?.rate != null ? String(current.rate) : '')
    setEditing(true)
  }

  function handleConfirm() {
    const parsed = parseFloat(value)
    if (!parsed || parsed <= 0) return
    mutation.mutate(parsed)
  }

  if (isLoading) return null

  return (
    <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center flex-shrink-0">
        <ArrowLeftRight size={14} />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">1 USD =</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                AR$
              </span>
              <input
                type="number"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min="0"
                step="0.01"
                className="w-28 text-xs pl-8 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={mutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              <Check size={11} />
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-white text-xs font-medium rounded-lg transition-colors"
            >
              <X size={11} />
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">Tipo de cambio de referencia</span>
            {current?.rate != null ? (
              <span className="text-xs text-slate-600">
                1 USD = AR$ {current.rate.toLocaleString('es-AR')}
                {current.updatedAt && (
                  <span className="text-slate-400">
                    {' '}· actualizado el {formatDate(current.updatedAt)}
                    {current.updatedBy ? ` por ${current.updatedBy}` : ''}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-slate-400">sin configurar</span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium text-xs px-1.5 py-0.5 rounded-md hover:bg-white"
              >
                <Pencil size={11} />
                Actualizar
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-0.5">
          Se usa como valor sugerido al cargar una póliza, documento, cuota o activo nuevo — no modifica los
          montos ya guardados, que quedan cerrados en pesos y dólares con el tipo de cambio de su propio momento.
        </p>
      </div>
    </div>
  )
}
