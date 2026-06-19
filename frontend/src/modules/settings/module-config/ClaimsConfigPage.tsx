import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { CatalogManager } from '../../../shared/components/catalogs/CatalogManager'

export default function ClaimsConfigPage() {
  return (
    <PageContent>
      <PageHeader
        title="Configuración — Siniestros"
        backTo="/settings/module-config"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Tipos de Siniestro"
          subtitle="Naturaleza del evento: accidente, incendio, robo, etc."
          noPadding
        >
          <CatalogManager
            category="claim_type"
            title="Tipos de Siniestro"
            addPlaceholder="Ej: Daño por granizo"
          />
        </SectionCard>

        <SectionCard
          title="Estados de Siniestro"
          subtitle="Ciclo de vida: Denunciado, En trámite, Liquidado, etc."
          noPadding
        >
          <CatalogManager
            category="claim_status"
            title="Estados de Siniestro"
            addPlaceholder="Ej: En pericia"
          />
        </SectionCard>
      </div>
    </PageContent>
  )
}
