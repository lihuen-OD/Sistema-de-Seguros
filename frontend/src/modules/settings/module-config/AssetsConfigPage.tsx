import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { CatalogManager } from '../../../shared/components/catalogs/CatalogManager'

export default function AssetsConfigPage() {
  return (
    <PageContent>
      <PageHeader
        title="Configuración — Activos"
        backTo="/settings/module-config"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Combustible" noPadding>
          <CatalogManager
            category="asset_fuel_type"
            title="Combustible"
            addPlaceholder="Ej: Gasoil"
          />
        </SectionCard>

        <SectionCard title="Destino de edificio" noPadding>
          <CatalogManager
            category="asset_building_purpose"
            title="Destino de edificio"
            addPlaceholder="Ej: Depósito"
          />
        </SectionCard>

        <SectionCard title="Tipo de infraestructura" noPadding>
          <CatalogManager
            category="asset_infrastructure_type"
            title="Tipo de infraestructura"
            addPlaceholder="Ej: Silo"
          />
        </SectionCard>

        <SectionCard title="Contenido de silo" noPadding>
          <CatalogManager
            category="asset_silo_content"
            title="Contenido de silo"
            addPlaceholder="Ej: Soja"
          />
        </SectionCard>

        <SectionCard title="Especie de carga" noPadding>
          <CatalogManager
            category="asset_cargo_species"
            title="Especie de carga"
            addPlaceholder="Ej: Maíz"
          />
        </SectionCard>

        <SectionCard title="Tipo de implemento" noPadding>
          <CatalogManager
            category="asset_implement_type"
            title="Tipo de implemento"
            addPlaceholder="Ej: Sembradora"
          />
        </SectionCard>

        <SectionCard title="Unidades productivas" noPadding>
          <CatalogManager
            category="asset_productive_unit"
            title="Unidades productivas"
            addPlaceholder="Ej: Establecimiento Norte"
          />
        </SectionCard>

        <SectionCard title="Áreas" noPadding>
          <CatalogManager
            category="asset_area"
            title="Áreas"
            addPlaceholder="Ej: Lote 3"
          />
        </SectionCard>
      </div>
    </PageContent>
  )
}
