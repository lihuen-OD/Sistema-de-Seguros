import { fireExtinguisherAuditsApi, fireExtinguisherAuditKeys, fireExtinguisherAuditQueries } from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'
import { AuditWizard } from './AuditWizard'

export default function FireExtinguisherAuditNewPage() {
  return (
    <AuditWizard
      population="ESTABLISHMENT"
      api={fireExtinguisherAuditsApi}
      auditKeys={fireExtinguisherAuditKeys}
      auditDetailQuery={fireExtinguisherAuditQueries.detail}
      coverageQuery={fireExtinguisherAuditQueries.coverage}
      detailRoute={ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL}
      backRoute={ROUTES.FIRE_EXTINGUISHERS}
      backLabel="Volver a Matafuegos"
      category="Matafuegos"
      newTitle="Auditoría mensual"
      newSubtitle="Registrar la inspección física de un matafuego"
    />
  )
}
