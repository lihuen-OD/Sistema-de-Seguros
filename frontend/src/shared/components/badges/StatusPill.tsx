import clsx from 'clsx'
import {
  ASSET_STATUS_LABELS,
  POLICY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  FIRE_EXT_STATUS_LABELS,
  FIRE_EXT_AUDIT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from '../../constants'

type StatusType =
  | 'activo' | 'inactivo' | 'en_reparacion' | 'vendido' | 'dado_de_baja' | 'pendiente_documentacion'
  | 'vigente' | 'proximo_vencer' | 'vencida'
  | 'pendiente' | 'parcial' | 'pagado'
  | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'NOT_APPLICABLE'
  | 'ISSUED' | 'APPLIED' | 'CANCELLED' | 'OBSERVED'
  | 'vencido'
  | 'en_curso' | 'finalizada'
  | 'baja' | 'media' | 'alta'
  | 'sin_factura'
  | string

const statusConfig: Record<string, { bg: string; text: string; border: string }> = {
  // Asset
  activo:                  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  inactivo:                { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200'  },
  en_reparacion:           { bg: 'bg-brand-50',    text: 'text-brand-700',    border: 'border-brand-200'   },
  vendido:                 { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  dado_de_baja:            { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  // Policy
  vigente:                 { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  proximo_vencer:          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  vencida:                 { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  sin_factura:             { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  // Payment (legacy es-ES keys, kept for other modules)
  pendiente:               { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  parcial:                 { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  pagado:                  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  // Payment (technical keys — Documentos Contables)
  PENDING:                 { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  PARTIALLY_PAID:          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  PAID:                    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  OVERDUE:                 { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  NOT_APPLICABLE:          { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200'  },
  // Document status
  ISSUED:                  { bg: 'bg-brand-50',    text: 'text-brand-700',    border: 'border-brand-200'   },
  APPLIED:                 { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CANCELLED:               { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  OBSERVED:                { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200' },
  // Fire ext
  vencido:                 { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  // Fire ext — auditorías (Fase 4)
  SUBMITTED:               { bg: 'bg-brand-50',    text: 'text-brand-700',    border: 'border-brand-200'   },
  APPROVED:                { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  REJECTED:                { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  NEEDS_CORRECTION:        { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  // Task
  en_curso:                { bg: 'bg-brand-50',    text: 'text-brand-700',    border: 'border-brand-200'   },
  finalizada:              { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  // Priority
  baja:                    { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200'  },
  media:                   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  alta:                    { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  pendiente_documentacion: { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200' },
  // Claims (Siniestros) — claves en español porque son el propio texto a mostrar
  'Denunciado':            { bg: 'bg-brand-50',    text: 'text-brand-700',    border: 'border-brand-200'   },
  'En trámite':            { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  'Liquidado':             { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Rechazado':             { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    },
  'Cerrado':               { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200'  },
}

const allLabels = {
  ...ASSET_STATUS_LABELS,
  ...POLICY_STATUS_LABELS,
  ...PAYMENT_STATUS_LABELS,
  ...DOCUMENT_STATUS_LABELS,
  ...FIRE_EXT_STATUS_LABELS,
  ...FIRE_EXT_AUDIT_STATUS_LABELS,
  ...TASK_STATUS_LABELS,
  ...TASK_PRIORITY_LABELS,
}

interface StatusPillProps {
  status: StatusType
  label?: string
  size?: 'sm' | 'md'
  icon?: React.ElementType
}

export function StatusPill({ status, label, size = 'md', icon: Icon }: StatusPillProps) {
  const cfg = statusConfig[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' }
  const displayLabel = label ?? allLabels[status] ?? status

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-medium rounded-full border whitespace-nowrap',
        cfg.bg, cfg.text, cfg.border,
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
      )}
    >
      {Icon && <Icon size={size === 'sm' ? 10 : 12} />}
      {displayLabel}
    </span>
  )
}
