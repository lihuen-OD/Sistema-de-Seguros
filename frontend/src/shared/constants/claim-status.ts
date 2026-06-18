import { FileSearch, Clock, CheckCircle2, XCircle } from 'lucide-react'
import type { ElementType } from 'react'
import type { ClaimStatus } from '../types'

export const CLAIM_STATUS_STYLES: Record<ClaimStatus, string> = {
  denunciado:  'bg-blue-50 text-blue-700 border-blue-200',
  en_tramite:  'bg-amber-50 text-amber-700 border-amber-200',
  liquidado:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  rechazado:   'bg-red-50 text-red-700 border-red-200',
  cerrado:     'bg-slate-100 text-slate-600 border-slate-200',
}

export const CLAIM_STATUS_ICONS: Record<ClaimStatus, ElementType> = {
  denunciado:  FileSearch,
  en_tramite:  Clock,
  liquidado:   CheckCircle2,
  rechazado:   XCircle,
  cerrado:     XCircle,
}
