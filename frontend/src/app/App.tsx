import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LoadingState } from '../shared/components/empty-states/LoadingState'
import { AppLayout } from './AppLayout'

// Auth
const LoginPage = lazy(() => import('../modules/auth/LoginPage'))

// Dashboard
const DashboardPage = lazy(() => import('../modules/dashboard/DashboardPage'))

// Notifications
const NotificationsPage = lazy(() => import('../modules/notifications/NotificationsPage'))

// Assets
const AssetsPage = lazy(() => import('../modules/assets/AssetsPage'))
const AssetDetailPage = lazy(() => import('../modules/assets/AssetDetailPage'))
const AssetNewPage = lazy(() => import('../modules/assets/AssetNewPage'))
const AssetEditPage = lazy(() => import('../modules/assets/AssetEditPage'))
const AssetFichaPage = lazy(() => import('../modules/assets/AssetFichaPage'))

// Insurance — Policies
const PoliciesPage = lazy(() => import('../modules/insurance/policies/PoliciesPage'))
const PolicyDetailPage = lazy(() => import('../modules/insurance/policies/PolicyDetailPage'))
const PolicyNewPage = lazy(() => import('../modules/insurance/policies/PolicyNewPage'))
const PolicyEditPage = lazy(() => import('../modules/insurance/policies/PolicyEditPage'))
const PolicyFichaPage = lazy(() => import('../modules/insurance/policies/PolicyFichaPage'))

// Insurance — Documents
const DocumentsPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentsPage'))
const DocumentDetailPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentDetailPage'))
const DocumentNewPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentNewPage'))
const DocumentEditPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentEditPage'))
const DocumentFichaPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentFichaPage'))

// Insurance — Analysis
const FinancialAnalysisPage = lazy(() => import('../modules/insurance/financial-analysis/FinancialAnalysisPage'))
const EconomicAnalysisPage = lazy(() => import('../modules/insurance/economic-analysis/EconomicAnalysisPage'))

// Producers
const ProducersPage = lazy(() => import('../modules/producers/ProducersPage'))
const ProducerDetailPage = lazy(() => import('../modules/producers/ProducerDetailPage'))
const ProducerNewPage = lazy(() => import('../modules/producers/ProducerNewPage'))
const ProducerEditPage = lazy(() => import('../modules/producers/ProducerEditPage'))

// Tasks
const TasksPage = lazy(() => import('../modules/producers/ProducerTasksPage'))
const TaskDetailPage = lazy(() => import('../modules/tasks/TaskDetailPage'))
const TaskNewPage = lazy(() => import('../modules/tasks/TaskNewPage'))
const TaskEditPage = lazy(() => import('../modules/tasks/TaskEditPage'))

// Claims (Siniestros)
const ClaimsPage = lazy(() => import('../modules/claims/ClaimsPage'))
const ClaimNewPage = lazy(() => import('../modules/claims/ClaimNewPage'))
const ClaimDetailPage = lazy(() => import('../modules/claims/ClaimDetailPage'))
const ClaimEditPage = lazy(() => import('../modules/claims/ClaimEditPage'))
const ClaimFichaPage = lazy(() => import('../modules/claims/ClaimFichaPage'))

// Fire Extinguishers
const FireExtinguishersPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguishersPage'))
const FireExtinguisherDetailPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguisherDetailPage'))
const FireExtinguisherNewPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguisherNewPage'))
const FireExtinguisherEditPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguisherEditPage'))
const FireExtinguisherFichaPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguisherFichaPage'))
const FireExtinguisherAuditNewPage = lazy(() => import('../modules/fire-extinguishers/audits/FireExtinguisherAuditNewPage'))
const FireExtinguisherAuditsQueuePage = lazy(() => import('../modules/fire-extinguishers/audits/FireExtinguisherAuditsQueuePage'))
const FireExtinguisherDashboardPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguisherDashboardPage'))
const FireExtinguisherAuditDetailPage = lazy(() => import('../modules/fire-extinguishers/audits/FireExtinguisherAuditDetailPage'))

// Settings
const CompaniesPage = lazy(() => import('../modules/settings/companies/CompaniesPage'))
const CostCentersPage = lazy(() => import('../modules/settings/cost-centers/CostCentersPage'))
const InsuranceTypesPage = lazy(() => import('../modules/settings/insurance-types/InsuranceTypesPage'))
const ModuleConfigPage = lazy(() => import('../modules/settings/module-config/ModuleConfigPage'))
const AssetsConfigPage = lazy(() => import('../modules/settings/module-config/AssetsConfigPage'))
const PoliciesConfigPage = lazy(() => import('../modules/settings/module-config/PoliciesConfigPage'))
const FireExtConfigPage = lazy(() => import('../modules/settings/module-config/FireExtConfigPage'))
const TasksConfigPage = lazy(() => import('../modules/settings/module-config/TasksConfigPage'))
const ClaimsConfigPage = lazy(() => import('../modules/settings/module-config/ClaimsConfigPage'))
const UsersPage = lazy(() => import('../modules/settings/users/UsersPage'))

function PageFallback() {
  return (
    <div className="p-6">
      <LoadingState rows={6} />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Login — fuera del AppShell, sin sesión requerida */}
        <Route path="/login" element={<LoginPage />} />

        {/* Todo lo demás vive detrás de AppLayout: guard de sesión + guard de rol + AppShell */}
        <Route element={<AppLayout />}>
          {/* Root */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Notifications */}
          <Route path="/notifications" element={<NotificationsPage />} />

          {/* Assets */}
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/new" element={<AssetNewPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route path="/assets/:id/edit" element={<AssetEditPage />} />
          <Route path="/assets/:id/ficha" element={<AssetFichaPage />} />

          {/* Insurance — Policies */}
          <Route path="/insurance/policies" element={<PoliciesPage />} />
          <Route path="/insurance/policies/new" element={<PolicyNewPage />} />
          <Route path="/insurance/policies/:id" element={<PolicyDetailPage />} />
          <Route path="/insurance/policies/:id/edit" element={<PolicyEditPage />} />
          <Route path="/insurance/policies/:id/ficha" element={<PolicyFichaPage />} />

          {/* Insurance — Documents */}
          <Route path="/insurance/documents" element={<DocumentsPage />} />
          <Route path="/insurance/documents/new" element={<DocumentNewPage />} />
          <Route path="/insurance/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/insurance/documents/:id/edit" element={<DocumentEditPage />} />
          <Route path="/insurance/documents/:id/ficha" element={<DocumentFichaPage />} />

          {/* Analysis */}
          <Route path="/insurance/financial-analysis" element={<FinancialAnalysisPage />} />
          <Route path="/insurance/economic-analysis" element={<EconomicAnalysisPage />} />

          {/* Producers */}
          <Route path="/producers" element={<ProducersPage />} />
          <Route path="/producers/new" element={<ProducerNewPage />} />
          <Route path="/producers/:id" element={<ProducerDetailPage />} />
          <Route path="/producers/:id/edit" element={<ProducerEditPage />} />

          {/* Tasks */}
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<TaskNewPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/tasks/:id/edit" element={<TaskEditPage />} />

          {/* Claims (Siniestros) */}
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/claims/new" element={<ClaimNewPage />} />
          <Route path="/claims/:id" element={<ClaimDetailPage />} />
          <Route path="/claims/:id/edit" element={<ClaimEditPage />} />
          <Route path="/claims/:id/ficha" element={<ClaimFichaPage />} />

          {/* Fire Extinguishers */}
          <Route path="/fire-extinguishers" element={<FireExtinguishersPage />} />
          <Route path="/fire-extinguishers/new" element={<FireExtinguisherNewPage />} />
          <Route path="/fire-extinguishers/dashboard" element={<FireExtinguisherDashboardPage />} />
          <Route path="/fire-extinguishers/audits" element={<FireExtinguisherAuditsQueuePage />} />
          <Route path="/fire-extinguishers/audits/new" element={<FireExtinguisherAuditNewPage />} />
          <Route path="/fire-extinguishers/audits/:id" element={<FireExtinguisherAuditDetailPage />} />
          <Route path="/fire-extinguishers/:id" element={<FireExtinguisherDetailPage />} />
          <Route path="/fire-extinguishers/:id/edit" element={<FireExtinguisherEditPage />} />
          <Route path="/fire-extinguishers/:id/ficha" element={<FireExtinguisherFichaPage />} />

          {/* Settings */}
          <Route path="/settings/companies" element={<CompaniesPage />} />
          <Route path="/settings/cost-centers" element={<CostCentersPage />} />
          <Route path="/settings/insurance-types" element={<InsuranceTypesPage />} />
          <Route path="/settings/module-config" element={<ModuleConfigPage />} />
          <Route path="/settings/module-config/assets" element={<AssetsConfigPage />} />
          <Route path="/settings/module-config/policies" element={<PoliciesConfigPage />} />
          <Route path="/settings/module-config/fire-extinguishers" element={<FireExtConfigPage />} />
          <Route path="/settings/module-config/tasks" element={<TasksConfigPage />} />
          <Route path="/settings/module-config/claims" element={<ClaimsConfigPage />} />
          <Route path="/settings/users" element={<UsersPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
