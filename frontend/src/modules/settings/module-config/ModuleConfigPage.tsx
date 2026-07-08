import { useNavigate } from 'react-router-dom'
import { Package, ShieldCheck, Flame, ClipboardList, ShieldAlert, ArrowRight } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'

interface ModuleCardProps {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  catalogs: string[]
  to: string
}

function ModuleCard({ icon: Icon, iconColor, iconBg, title, catalogs, to }: ModuleCardProps) {
  const navigate = useNavigate()

  return (
    <div className="card p-5 flex flex-col gap-4 hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
      </div>

      <ul className="space-y-1.5">
        {catalogs.map((cat) => (
          <li key={cat} className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
            <span className="text-xs text-slate-500">{cat}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => navigate(to)}
        className="mt-auto flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
      >
        Configurar
        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  )
}

const modules: ModuleCardProps[] = [
  {
    icon: Package,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    title: 'Activos',
    catalogs: [
      'Combustible',
      'Destino de edificio',
      'Tipo de infraestructura',
      'Contenido de silo',
      'Especie de carga',
      'Tipo de implemento',
      'Unidades productivas',
      'Áreas',
    ],
    to: '/settings/module-config/assets',
  },
  {
    icon: ShieldCheck,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    title: 'Pólizas y Documentos',
    catalogs: ['Compañías Aseguradoras', 'Formas de Pago', 'Monedas'],
    to: '/settings/module-config/policies',
  },
  {
    icon: ShieldAlert,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    title: 'Siniestros',
    catalogs: ['Tipos de Siniestro', 'Estados de Siniestro'],
    to: '/settings/module-config/claims',
  },
  {
    icon: Flame,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50',
    title: 'Matafuegos',
    catalogs: ['Tipo de matafuego', 'Capacidad', 'Asignación física', 'Establecimiento', 'Marca'],
    to: '/settings/module-config/fire-extinguishers',
  },
  {
    icon: ClipboardList,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50',
    title: 'Tareas',
    catalogs: ['Tipos de tarea'],
    to: '/settings/module-config/tasks',
  },
]

export default function ModuleConfigPage() {
  return (
    <PageContent>
      <PageHeader
        title="Configuración de Módulos"
        subtitle="Administrá los valores disponibles en cada módulo"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <ModuleCard key={mod.to} {...mod} />
        ))}
      </div>
    </PageContent>
  )
}
