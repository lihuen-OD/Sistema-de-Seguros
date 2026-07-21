import { useRef, useState, useEffect } from 'react'
import { Bell, ShieldAlert, CreditCard, Flame, Paperclip, X, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificationQueries } from '../../api/notifications.api'

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery(notificationQueries.preview())

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const totalAlerts = data
    ? data.expiringPolicies + data.expiringExtinguishers + data.overdueInstallments + data.nearInstallments + data.expiringAttachments
    : 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {!isLoading && totalAlerts > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {totalAlerts > 99 ? '99+' : totalAlerts}
          </span>
        )}
        {!isLoading && totalAlerts === 0 && data && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-400 rounded-full" />
        )}
        {isLoading && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-slate-300 rounded-full animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Notificaciones</h3>
              {totalAlerts > 0 && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">
                  {totalAlerts}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data || totalAlerts === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <Bell size={18} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Todo en orden</p>
              <p className="text-xs text-slate-400 mt-1">No hay alertas pendientes</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
              {data.expiringPolicies > 0 && (
                <AlertRow
                  icon={ShieldAlert}
                  iconColor="text-amber-500"
                  iconBg="bg-amber-50"
                  label={`${data.expiringPolicies} póliza${data.expiringPolicies !== 1 ? 's' : ''} próxima${data.expiringPolicies !== 1 ? 's' : ''} a vencer`}
                  sub="Vencen en los próximos 30 días"
                  onClick={() => { navigate('/insurance/policies'); setOpen(false) }}
                />
              )}
              {data.overdueInstallments > 0 && (
                <AlertRow
                  icon={CreditCard}
                  iconColor="text-red-500"
                  iconBg="bg-red-50"
                  label={`${data.overdueInstallments} cuota${data.overdueInstallments !== 1 ? 's' : ''} vencida${data.overdueInstallments !== 1 ? 's' : ''}`}
                  sub="Cuotas con fecha de vencimiento superada"
                  onClick={() => { navigate('/insurance/financial-analysis'); setOpen(false) }}
                />
              )}
              {data.nearInstallments > 0 && (
                <AlertRow
                  icon={CreditCard}
                  iconColor="text-amber-500"
                  iconBg="bg-amber-50"
                  label={`${data.nearInstallments} cuota${data.nearInstallments !== 1 ? 's' : ''} a vencer esta semana`}
                  sub="Vencen en los próximos 7 días"
                  onClick={() => { navigate('/insurance/financial-analysis'); setOpen(false) }}
                />
              )}
              {data.expiringExtinguishers > 0 && (
                <AlertRow
                  icon={Flame}
                  iconColor="text-orange-500"
                  iconBg="bg-orange-50"
                  label={`${data.expiringExtinguishers} matafuego${data.expiringExtinguishers !== 1 ? 's' : ''} vencido${data.expiringExtinguishers !== 1 ? 's' : ''} o próximo${data.expiringExtinguishers !== 1 ? 's' : ''}`}
                  sub="Requieren recarga o revisión"
                  onClick={() => { navigate('/fire-extinguishers'); setOpen(false) }}
                />
              )}
              {data.expiringAttachments > 0 && (
                <AlertRow
                  icon={Paperclip}
                  iconColor="text-brand-500"
                  iconBg="bg-brand-50"
                  label={`${data.expiringAttachments} documento${data.expiringAttachments !== 1 ? 's' : ''} adjunto${data.expiringAttachments !== 1 ? 's' : ''} por vencer`}
                  sub="Adjuntos de Activos y Pólizas"
                  onClick={() => { navigate('/notifications'); setOpen(false) }}
                />
              )}
            </div>
          )}

          {/* Footer */}
          <button
            onClick={() => { navigate('/notifications'); setOpen(false) }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 bg-slate-50/80 hover:bg-slate-100 text-xs font-medium text-slate-600 transition-colors"
          >
            Ver todas las notificaciones
            <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Alert row ──────────────────────────────────────────────────────────────────

function AlertRow({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  sub,
  onClick,
}: {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  label: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 text-left transition-colors"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
        <Icon size={15} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 leading-snug">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </button>
  )
}
