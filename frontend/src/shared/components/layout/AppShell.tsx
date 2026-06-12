import { useState } from 'react'
import { Sidebar } from '../sidebar/Sidebar'
import { Topbar } from '../topbar/Topbar'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden print:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex-shrink-0 w-64 bg-slate-900 flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          print:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main area — topbar + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:block print:overflow-visible">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  )
}
