import type { PropsWithChildren } from 'react'
import { AlertTriangle } from 'lucide-react'

export function DataWarning({ children }: PropsWithChildren) {
  return (
    <div className="flex items-start gap-2.5 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
