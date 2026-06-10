import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoadingState } from '../shared/components/empty-states/LoadingState'

// Dashboard
const DashboardPage = lazy(() => import('../modules/dashboard/DashboardPage'))

// Assets
const AssetsPage = lazy(() => import('../modules/assets/AssetsPage'))
const AssetDetailPage = lazy(() => import('../modules/assets/AssetDetailPage'))
const AssetNewPage = lazy(() => import('../modules/assets/AssetNewPage'))

// Insurance — Policies
const PoliciesPage = lazy(() => import('../modules/insurance/policies/PoliciesPage'))
const PolicyDetailPage = lazy(() => import('../modules/insurance/policies/PolicyDetailPage'))
const PolicyNewPage = lazy(() => import('../modules/insurance/policies/PolicyNewPage'))

// Insurance — Documents
const DocumentsPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentsPage'))
const DocumentDetailPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentDetailPage'))
const DocumentNewPage = lazy(() => import('../modules/insurance/accounting-documents/DocumentNewPage'))

// Insurance — Analysis
const FinancialAnalysisPage = lazy(() => import('../modules/insurance/financial-analysis/FinancialAnalysisPage'))
const EconomicAnalysisPage = lazy(() => import('../modules/insurance/economic-analysis/EconomicAnalysisPage'))

// Producers
const ProducersPage = lazy(() => import('../modules/producers/ProducersPage'))
const ProducerDetailPage = lazy(() => import('../modules/producers/ProducerDetailPage'))
const ProducerTasksPage = lazy(() => import('../modules/producers/ProducerTasksPage'))

// Fire Extinguishers
const FireExtinguishersPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguishersPage'))
const FireExtinguisherDetailPage = lazy(() => import('../modules/fire-extinguishers/FireExtinguisherDetailPage'))

// Settings
const CompaniesPage = lazy(() => import('../modules/settings/companies/CompaniesPage'))
const CostCentersPage = lazy(() => import('../modules/settings/cost-centers/CostCentersPage'))

function PageFallback() {
  return (
    <div className="p-6">
      <LoadingState rows={6} />
    </div>
  )
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Root */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Assets */}
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/new" element={<AssetNewPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />

          {/* Insurance — Policies */}
          <Route path="/insurance/policies" element={<PoliciesPage />} />
          <Route path="/insurance/policies/new" element={<PolicyNewPage />} />
          <Route path="/insurance/policies/:id" element={<PolicyDetailPage />} />

          {/* Insurance — Documents */}
          <Route path="/insurance/documents" element={<DocumentsPage />} />
          <Route path="/insurance/documents/new" element={<DocumentNewPage />} />
          <Route path="/insurance/documents/:id" element={<DocumentDetailPage />} />

          {/* Analysis */}
          <Route path="/insurance/financial-analysis" element={<FinancialAnalysisPage />} />
          <Route path="/insurance/economic-analysis" element={<EconomicAnalysisPage />} />

          {/* Producers */}
          <Route path="/producers" element={<ProducersPage />} />
          <Route path="/producers/tasks" element={<ProducerTasksPage />} />
          <Route path="/producers/:id" element={<ProducerDetailPage />} />

          {/* Fire Extinguishers */}
          <Route path="/fire-extinguishers" element={<FireExtinguishersPage />} />
          <Route path="/fire-extinguishers/:id" element={<FireExtinguisherDetailPage />} />

          {/* Settings */}
          <Route path="/settings/companies" element={<CompaniesPage />} />
          <Route path="/settings/cost-centers" element={<CostCentersPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
