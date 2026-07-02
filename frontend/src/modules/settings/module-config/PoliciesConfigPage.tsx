import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { CatalogManager } from '../../../shared/components/catalogs/CatalogManager'

export default function PoliciesConfigPage() {
  return (
    <PageContent>
      <PageHeader
        title="Configuración — Pólizas y Documentos"
        backTo="/settings/module-config"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Compañías Aseguradoras"
          subtitle="Usadas en Pólizas, Documentos y Siniestros"
          noPadding
        >
          <CatalogManager
            category="insurance_company"
            title="Compañías Aseguradoras"
            addPlaceholder="Ej: Allianz Argentina"
          />
        </SectionCard>

        <SectionCard
          title="Formas de Pago"
          subtitle="Opciones de forma de pago en documentos contables"
          noPadding
        >
          <CatalogManager
            category="document_payment_method"
            title="Formas de Pago"
            addPlaceholder="Ej: Cheque diferido"
          />
        </SectionCard>

        <SectionCard
          title="Monedas"
          subtitle="Monedas disponibles en documentos"
          noPadding
        >
          <CatalogManager
            category="document_currency"
            title="Monedas"
            addPlaceholder="Ej: EUR"
          />
        </SectionCard>
      </div>
    </PageContent>
  )
}
