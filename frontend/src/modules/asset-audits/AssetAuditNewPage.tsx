import { assetAuditsApi, assetAuditKeys, assetAuditQueries } from '../../shared/api/asset-audits.api'
import { ROUTES } from '../../app/routes'
import { AuditWizard } from '../fire-extinguishers/audits/AuditWizard'

export default function AssetAuditNewPage() {
  return (
    <AuditWizard
      population="ASSET"
      api={assetAuditsApi}
      auditKeys={assetAuditKeys}
      auditDetailQuery={assetAuditQueries.detail}
      coverageQuery={assetAuditQueries.coverage}
      detailRoute={ROUTES.ASSET_AUDITS_DETAIL}
      backRoute={ROUTES.ASSET_AUDITS}
      backLabel="Volver a Auditoría de Activos"
      category="Auditoría de Activos"
      newTitle="Auditoría de Activos"
      newSubtitle="Registrar la inspección del matafuego montado en un vehículo o maquinaria"
    />
  )
}
