import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { CatalogManager } from '../../../shared/components/catalogs/CatalogManager'

export default function FireExtConfigPage() {
  return (
    <PageContent>
      <PageHeader
        title="Configuración — Matafuegos"
        backTo="/settings/module-config"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Tipo de matafuego" noPadding>
          <CatalogManager
            category="fire_ext_type"
            title="Tipo de matafuego"
            addPlaceholder="Ej: ABC Polvo seco"
          />
        </SectionCard>

        <SectionCard title="Capacidad" noPadding>
          <CatalogManager
            category="fire_ext_capacity"
            title="Capacidad"
            addPlaceholder="Ej: 1 kg"
          />
        </SectionCard>
      </div>
    </PageContent>
  )
}
