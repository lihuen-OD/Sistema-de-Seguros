import clsx from 'clsx'

export interface TabItem {
  id: string
  label: string
  icon?: React.ElementType
  count?: number
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={clsx('flex items-center gap-1 px-4 py-3 border-b border-slate-100 overflow-x-auto scrollbar-hide', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all',
              isActive ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
            )}
          >
            {Icon && <Icon size={13} />}
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span
                className={clsx(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
