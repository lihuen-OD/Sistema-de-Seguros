import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ShieldCheck,
  FileText,
  BarChart2,
  TrendingUp,
  Users,
  Flame,
  Building2,
  Layers,
  X,
  LogOut,
  ShieldAlert,
  Shield,
  ClipboardList,
  ClipboardCheck,
  SlidersHorizontal,
  BarChart3,
  Bell,
  UserCog,
} from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import { isAllowedForAuditorMatafuegos } from '../../../app/auth/roleScope'

interface SidebarProps {
  onClose?: () => void
}

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  adminOnly?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Notificaciones', to: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Patrimonio',
    items: [
      { label: 'Activos', to: '/assets', icon: Package },
    ],
  },
  {
    label: 'Matafuegos',
    items: [
      { label: 'Matafuegos', to: '/fire-extinguishers', icon: Flame },
      { label: 'Auditoría de Matafuegos', to: '/fire-extinguishers/audits', icon: ClipboardCheck },
      { label: 'Dashboard de Matafuegos', to: '/fire-extinguishers/dashboard', icon: BarChart3 },
    ],
  },
  {
    label: 'Seguros',
    items: [
      { label: 'Pólizas', to: '/insurance/policies', icon: ShieldCheck },
      { label: 'Documentos', to: '/insurance/documents', icon: FileText },
      { label: 'Siniestros', to: '/claims', icon: ShieldAlert },
      { label: 'Análisis Financiero', to: '/insurance/financial-analysis', icon: BarChart2 },
      { label: 'Análisis Económico', to: '/insurance/economic-analysis', icon: TrendingUp },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { label: 'Productores', to: '/producers', icon: Users },
      { label: 'Tareas', to: '/tasks', icon: ClipboardList },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { label: 'Empresas', to: '/settings/companies', icon: Building2 },
      { label: 'Centros de Costo', to: '/settings/cost-centers', icon: Layers },
      { label: 'Tipos de Seguro', to: '/settings/insurance-types', icon: Shield },
      { label: 'Config. de Módulos', to: '/settings/module-config', icon: SlidersHorizontal },
      { label: 'Usuarios', to: '/settings/users', icon: UserCog, adminOnly: true },
    ],
  },
]

// Iniciales para el avatar del footer — "Juan Pérez" -> "JP", "Admin" -> "AD".
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return initials.toUpperCase()
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation()
  const { user, logout } = useCurrentUser()

  // AUDITOR_MATAFUEGOS solo ve el flujo de auditoría — mismo criterio que
  // ya aplica el guard de rutas, reusado acá para no duplicar la lista.
  // "Usuarios" además queda oculto para cualquiera que no sea ADMIN.
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && user?.role !== 'ADMIN') return false
        if (user?.role === 'AUDITOR_MATAFUEGOS' && !isAllowedForAuditorMatafuegos(item.to)) return false
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-white font-semibold text-sm leading-tight block">Patrimonio Pro</span>
            <span className="text-slate-500 text-xs leading-tight block">LOS OD</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5 scrollbar-hide">
        {visibleGroups.map((group) => {
          // Cuando dos rutas del mismo grupo comparten prefijo (ej. /fire-extinguishers
          // y /fire-extinguishers/audits/new), gana el match más específico — evita que
          // ambos ítems queden marcados como activos a la vez.
          const activeTo = group.items
            .map((item) => item.to)
            .filter((to) =>
              to === '/dashboard'
                ? location.pathname === '/dashboard' || location.pathname === '/'
                : location.pathname === to || location.pathname.startsWith(`${to}/`),
            )
            .sort((a, b) => b.length - a.length)[0]

          return (
          <div key={group.label}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 px-3 mb-1.5">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = item.to === activeTo
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
                      )}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 p-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-slate-300">
              {user ? getInitials(user.name) : '—'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-300 truncate">{user?.name ?? '—'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email ?? ''}</p>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
