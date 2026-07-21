import { FileSearch, Clock, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import type { ElementType } from 'react'

export const CLAIM_STATUS_STYLES: Record<string, string> = {
  'Denunciado':  'bg-brand-50 text-brand-700 border-brand-200',
  'En trámite':  'bg-amber-50 text-amber-700 border-amber-200',
  'Liquidado':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Rechazado':   'bg-red-50 text-red-700 border-red-200',
  'Cerrado':     'bg-slate-100 text-slate-600 border-slate-200',
}

export const CLAIM_STATUS_ICONS: Record<string, ElementType> = {
  'Denunciado':  FileSearch,
  'En trámite':  Clock,
  'Liquidado':   CheckCircle2,
  'Rechazado':   XCircle,
  'Cerrado':     XCircle,
}

export const CLAIM_STATUS_DEFAULT_STYLE = 'bg-slate-100 text-slate-600 border-slate-200'
export const CLAIM_STATUS_DEFAULT_ICON: ElementType = HelpCircle
