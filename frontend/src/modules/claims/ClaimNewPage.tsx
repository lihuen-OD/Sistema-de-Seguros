import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { claimRepository } from '../../services/repositories/claim.repository'
import { policyRepository } from '../../services/repositories/policy.repository'
import { mockAssets } from '../../data/mock-assets'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS, INSURANCE_COMPANIES } from '../../shared/constants'
import type { Claim, ClaimStatus, ClaimType } from '../../shared/types'

// ── Field helpers ─────────────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-600 mt-1.5">{message}</p>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-4">
      {children}
    </p>
  )
}

// ── Validation ────────────────────────────────────────────────────────────────

interface FormErrors {
  claimType?: string
  occurrenceDate?: string
  reportDate?: string
  description?: string
  insuranceCompany?: string
  claimedAmountArs?: string
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClaimNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const preselectedAssetId = searchParams.get('assetId') ?? ''
  const preselectedPolicyId = searchParams.get('policyId') ?? ''

  const preselectedAsset = preselectedAssetId
    ? mockAssets.find((a) => a.id === preselectedAssetId) ?? null
    : null

  // Form state
  const [assetId, setAssetId] = useState(preselectedAssetId)
  const [policyId, setPolicyId] = useState(preselectedPolicyId)
  const [claimType, setClaimType] = useState<ClaimType | ''>('')
  const [status, setStatus] = useState<ClaimStatus>('denunciado')
  const [occurrenceDate, setOccurrenceDate] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [description, setDescription] = useState('')
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [claimedAmountArs, setClaimedAmountArs] = useState('')
  const [settledAmountArs, setSettledAmountArs] = useState('')
  const [deductibleArs, setDeductibleArs] = useState('')
  const [observations, setObservations] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  // Derived
  const selectedAsset = assetId ? mockAssets.find((a) => a.id === assetId) ?? null : null
  const availablePolicies = assetId ? policyRepository.findByAsset(assetId) : []
  const selectedPolicy = policyId ? availablePolicies.find((p) => p.id === policyId) ?? null : null

  const handleAssetChange = (id: string) => {
    setAssetId(id)
    setPolicyId('')
    setInsuranceCompany('')
  }

  const handlePolicyChange = (id: string) => {
    setPolicyId(id)
    const pol = availablePolicies.find((p) => p.id === id)
    if (pol) setInsuranceCompany(pol.insuranceCompany)
    else setInsuranceCompany('')
  }

  const validate = (): boolean => {
    const e: FormErrors = {}
    if (!claimType) e.claimType = 'Seleccioná el tipo de siniestro.'
    if (!occurrenceDate) e.occurrenceDate = 'Ingresá la fecha del hecho.'
    if (!reportDate) e.reportDate = 'Ingresá la fecha de denuncia.'
    if (!description.trim()) e.description = 'Ingresá una descripción del hecho.'
    if (!insuranceCompany.trim()) e.insuranceCompany = 'Ingresá la compañía aseguradora.'
    if (!claimedAmountArs || isNaN(Number(claimedAmountArs)) || Number(claimedAmountArs) < 0)
      e.claimedAmountArs = 'Ingresá un monto reclamado válido.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    setSubmitting(true)

    const claim: Claim = {
      id: `claim-${Date.now()}`,
      assetId: assetId || '',
      policyId: policyId || null,
      claimNumber: `SIN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      claimType: claimType as ClaimType,
      occurrenceDate,
      reportDate,
      description: description.trim(),
      insuranceCompany: insuranceCompany.trim(),
      status,
      claimedAmountArs: Number(claimedAmountArs),
      settledAmountArs: settledAmountArs ? Number(settledAmountArs) : null,
      deductibleArs: deductibleArs ? Number(deductibleArs) : null,
      observations: observations.trim() || null,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    }

    claimRepository.create(claim)
    navigate(`/claims/${claim.id}`)
  }

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Siniestro"
        subtitle="Registrá un siniestro asociado a un activo o póliza"
        backTo="/claims"
        backLabel="Volver a siniestros"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Main form — 2/3 */}
        <div className="lg:col-span-2 space-y-5">

          {/* Sección: Activo y póliza */}
          <SectionCard title="Activo y Póliza">
            <SectionTitle>Asociación</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Activo */}
              <div>
                <FormLabel>Activo asociado</FormLabel>
                {preselectedAsset ? (
                  <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-blue-800">{preselectedAsset.name}</p>
                      <p className="text-xs text-blue-600">{preselectedAsset.internalCode} · {preselectedAsset.assetType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAssetId(''); setPolicyId(''); setInsuranceCompany('') }}
                      className="text-xs text-blue-500 hover:text-blue-700 ml-3 flex-shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <select
                    value={assetId}
                    onChange={(e) => handleAssetChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-slate-800"
                  >
                    <option value="">Sin activo asociado</option>
                    {mockAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.internalCode} — {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Póliza */}
              <div>
                <FormLabel>Póliza asociada</FormLabel>
                {availablePolicies.length > 0 ? (
                  <select
                    value={policyId}
                    onChange={(e) => handlePolicyChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-slate-800"
                  >
                    <option value="">Sin póliza asociada</option>
                    {availablePolicies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.policyNumber} — {p.insuranceCompany}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <TriangleAlert size={13} className="text-slate-400 flex-shrink-0" />
                    <p className="text-xs text-slate-500">
                      {assetId ? 'Sin pólizas asociadas al activo.' : 'Seleccioná un activo primero.'}
                    </p>
                  </div>
                )}
                {selectedPolicy && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {selectedPolicy.insuranceType} · {selectedPolicy.coverageType}
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Sección: Datos del siniestro */}
          <SectionCard title="Datos del Siniestro">
            <SectionTitle>Identificación</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <FormLabel required>Tipo de siniestro</FormLabel>
                <select
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value as ClaimType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-slate-800"
                >
                  <option value="">Seleccioná un tipo</option>
                  {(Object.entries(CLAIM_TYPE_LABELS) as [ClaimType, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <FieldError message={errors.claimType} />
              </div>

              <div>
                <FormLabel required>Estado inicial</FormLabel>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ClaimStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-slate-800"
                >
                  {(Object.entries(CLAIM_STATUS_LABELS) as [ClaimStatus, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <FormLabel required>Fecha del hecho</FormLabel>
                <input
                  type="date"
                  value={occurrenceDate}
                  onChange={(e) => setOccurrenceDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                />
                <FieldError message={errors.occurrenceDate} />
              </div>

              <div>
                <FormLabel required>Fecha de denuncia</FormLabel>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                />
                <FieldError message={errors.reportDate} />
              </div>
            </div>

            <div className="mt-4">
              <FormLabel required>Descripción del hecho</FormLabel>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describí qué ocurrió, cómo y dónde. Incluí detalles relevantes para el trámite."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white placeholder:text-slate-400 resize-none"
              />
              <FieldError message={errors.description} />
            </div>
          </SectionCard>

          {/* Sección: Aseguradora */}
          <SectionCard title="Aseguradora">
            <SectionTitle>Compañía</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Compañía aseguradora</FormLabel>
                <select
                  value={insuranceCompany}
                  onChange={(e) => setInsuranceCompany(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-slate-800"
                >
                  <option value="">Seleccioná una aseguradora</option>
                  {INSURANCE_COMPANIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <FieldError message={errors.insuranceCompany} />
              </div>
            </div>
          </SectionCard>

          {/* Sección: Montos */}
          <SectionCard title="Montos">
            <SectionTitle>Importes en ARS</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FormLabel required>Monto reclamado</FormLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    value={claimedAmountArs}
                    onChange={(e) => setClaimedAmountArs(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white placeholder:text-slate-400"
                  />
                </div>
                <FieldError message={errors.claimedAmountArs} />
              </div>

              <div>
                <FormLabel>Monto liquidado</FormLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    value={settledAmountArs}
                    onChange={(e) => setSettledAmountArs(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white placeholder:text-slate-400"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Completar cuando la aseguradora apruebe la liquidación</p>
              </div>

              <div>
                <FormLabel>Franquicia</FormLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    value={deductibleArs}
                    onChange={(e) => setDeductibleArs(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Observaciones */}
          <SectionCard title="Observaciones">
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Notas internas, estado de gestión, contactos en la aseguradora, próximos pasos, etc."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white placeholder:text-slate-400 resize-none"
            />
          </SectionCard>
        </div>

        {/* Right sidebar — 1/3 */}
        <div className="space-y-4">

          {/* Resumen */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow label="Tipo" value={claimType ? CLAIM_TYPE_LABELS[claimType] : '—'} />
              <SummaryRow label="Estado" value={CLAIM_STATUS_LABELS[status]} />
              <SummaryRow label="Activo" value={selectedAsset?.internalCode ?? '—'} />
              <SummaryRow label="Póliza" value={selectedPolicy?.policyNumber ?? '—'} />
              <SummaryRow label="Aseguradora" value={insuranceCompany || '—'} />
              <SummaryRow
                label="Monto reclamado"
                value={claimedAmountArs ? `AR$ ${Number(claimedAmountArs).toLocaleString('es-AR')}` : '—'}
              />
            </div>
          </SectionCard>

          {/* Hint */}
          <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-xl">
            <ShieldAlert size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              El número de siniestro se genera automáticamente al guardar. Podés actualizarlo luego con el
              número asignado por la aseguradora.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              Registrar siniestro
            </button>
            <button
              type="button"
              onClick={() => navigate('/claims')}
              className="w-full px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </PageContent>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-800 text-right break-words">{value}</span>
    </div>
  )
}
