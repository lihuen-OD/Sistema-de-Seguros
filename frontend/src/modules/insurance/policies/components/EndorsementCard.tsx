import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { FileEdit } from 'lucide-react'
import { formatDate } from '../../../../shared/utils/format'
import { ECONOMIC_IMPACT_TYPE_LABELS } from '../../../../shared/constants'
import { ROUTES } from '../../../../app/routes'
import type { AccountingDocument } from '../../../../shared/types'

const ENDORSEMENT_IMPACT_STYLE: Record<string, string> = {
  NO_IMPACT: 'bg-slate-100 text-slate-600',
  INCREASES_COST: 'bg-red-100 text-red-600',
  DECREASES_COST: 'bg-emerald-100 text-emerald-700',
  PENDING_DEFINITION: 'bg-amber-100 text-amber-700',
}

export function EndorsementCard({ doc }: { doc: AccountingDocument }) {
  const navigate = useNavigate()
  const impactStyle = ENDORSEMENT_IMPACT_STYLE[doc.economicImpactType ?? ''] ?? 'bg-slate-100 text-slate-600'

  return (
    <button
      type="button"
      onClick={() => navigate(ROUTES.DOCUMENTS_DETAIL(doc.id))}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
          <FileEdit size={15} className="text-violet-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 font-mono">{doc.documentNumber}</p>
            <span className="text-xs text-slate-400">·</span>
            <p className="text-xs text-slate-500">{formatDate(doc.issueDate)}</p>
          </div>
          {doc.endorsementEffectiveDate && (
            <p className="text-xs text-slate-400 mt-0.5">
              Vigencia: {formatDate(doc.endorsementEffectiveDate)}
            </p>
          )}
        </div>
      </div>
      <span className={clsx('text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0', impactStyle)}>
        {ECONOMIC_IMPACT_TYPE_LABELS[doc.economicImpactType ?? ''] ?? 'Sin impacto'}
      </span>
    </button>
  )
}
