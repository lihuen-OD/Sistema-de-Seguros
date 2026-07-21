import { Menu, Search, Settings } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { NotificationBell } from '../notifications/NotificationBell'
import { useCurrentUser } from '../../../app/auth/AuthContext'

interface TopbarProps {
  onMenuClick: () => void
}

const breadcrumbMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/assets': 'Activos',
  '/assets/new': 'Activos / Nuevo',
  '/insurance/policies': 'Pólizas',
  '/insurance/policies/new': 'Pólizas / Nueva',
  '/insurance/documents': 'Documentos',
  '/insurance/documents/new': 'Documentos / Nuevo',
  '/insurance/financial-analysis': 'Análisis Financiero',
  '/insurance/economic-analysis': 'Análisis Económico',
  '/producers': 'Productores',
  '/tasks': 'Tareas',
  '/tasks/new': 'Tareas / Nueva',
  '/fire-extinguishers': 'Matafuegos',
  '/claims': 'Siniestros',
  '/claims/new': 'Siniestros / Nuevo',
  '/settings/companies': 'Configuración / Empresas',
  '/settings/cost-centers': 'Configuración / Centros de Costo',
}

function getPageTitle(pathname: string): string {
  if (breadcrumbMap[pathname]) return breadcrumbMap[pathname]
  // Edit / ficha / sub-routes
  if (pathname.match(/^\/assets\/[^/]+\/edit$/)) return 'Activos / Editar'
  if (pathname.match(/^\/assets\/[^/]+\/ficha$/)) return 'Activos / Ficha PDF'
  // Detail pages
  if (pathname.startsWith('/assets/')) return 'Activos / Detalle'
  if (pathname.startsWith('/insurance/policies/')) return 'Pólizas / Detalle'
  if (pathname.startsWith('/insurance/documents/')) return 'Documentos / Detalle'
  if (pathname.startsWith('/producers/')) return 'Productores / Detalle'
  if (pathname.match(/^\/tasks\/[^/]+\/edit$/)) return 'Tareas / Editar'
  if (pathname.startsWith('/tasks/')) return 'Tareas / Detalle'
  if (pathname.startsWith('/fire-extinguishers/')) return 'Matafuegos / Detalle'
  if (pathname.startsWith('/claims/')) return 'Siniestros / Detalle'
  return 'Panel'
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const [searchQuery, setSearchQuery] = useState('')
  const title = getPageTitle(location.pathname)

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center gap-4 px-4 lg:px-6 flex-shrink-0 sticky top-0 z-10">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <h1 className="text-sm font-semibold text-slate-800 hidden sm:block whitespace-nowrap">
        {title}
      </h1>

      {/* Divider */}
      <div className="hidden sm:block w-px h-5 bg-slate-200" />

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar activos, pólizas, documentos…"
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications — agrega datos de todos los módulos, exclusivo del ADMIN */}
        {user?.role === 'ADMIN' && <NotificationBell />}

        {/* Settings */}
        <button
          onClick={() => navigate('/settings/companies')}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}
