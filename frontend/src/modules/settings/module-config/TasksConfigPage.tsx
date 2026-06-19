import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { CatalogManager } from '../../../shared/components/catalogs/CatalogManager'

export default function TasksConfigPage() {
  return (
    <PageContent>
      <PageHeader
        title="Configuración — Tareas"
        backTo="/settings/module-config"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Tipos de tarea" noPadding>
          <CatalogManager
            category="task_type"
            title="Tipos de tarea"
            addPlaceholder="Ej: Mantenimiento preventivo"
          />
        </SectionCard>
      </div>
    </PageContent>
  )
}
