import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ShieldAlert, TriangleAlert, ArrowLeftRight,
  Car, Lock, Package, Flame, CloudRain, Wheat, Waves, Wrench,
  Zap, Settings, Scale, Heart, Activity, HelpCircle,
  CheckCircle2, type LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../../shared/components/forms/FormSection'
import { FileDropzone } from '../../shared/components/file-upload/FileDropzone'
import { claimsApi } from '../../shared/api/claims.api'
import { assetsApi } from '../../shared/api/assets.api'
import { policiesApi } from '../../shared/api/policies.api'
import { catalogsApi } from '../../shared/api/catalogs.api'
import { OwnershipTypeFields } from './OwnershipTypeFields'
import type { ClaimOwnershipType } from '../../shared/types'

// ─── Claim type icon map (label → icon) ───────────────────────────────────────

const CLAIM_LABEL_ICON_MAP: Record<string, LucideIcon> = {
  'Accidente':              Car,
  'Robo con violencia':     Lock,
  'Hurto':                  Package,
  'Incendio':               Flame,
  'Granizo':                CloudRain,
  'Granizo (cosecha)':      Wheat,
  'Inundación':             Waves,
  'Daños materiales':       Wrench,
  'Daños eléctricos':       Zap,
  'Rotura mecánica':        Settings,
  'Responsabilidad civil':  Scale,
  'Muerte accidental':      Heart,
  'Incapacidad':            Activity,
  'Otro':                   HelpCircle,
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormErrors {
  claimType?: string
  occurrenceDate?: string
  reportDate?: string
  description?: string
  insuranceCompany?: string
  claimedAmount?: string
  exchangeRate?: string
  ownershipType?: string
  thirdPartyInsuranceCompany?: string
  thirdPartyContact?: string
  thirdPartyInsurerContact?: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClaimNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const preselectedAssetId = searchParams.get('assetId') ?? ''
  const preselectedPolicyId = searchParams.get('policyId') ?? ''

  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => assetsApi.findAll() })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: insuranceCompanies = [] } = useQuery({ queryKey: ['catalogs', 'insurance_company'], queryFn: () => catalogsApi.findByCategory('insurance_company') })
  const { data: claimTypes = [] } = useQuery({ queryKey: ['catalogs', 'claim_type'], queryFn: () => catalogsApi.findByCategory('claim_type') })
  const { data: claimStatuses = [] } = useQuery({ queryKey: ['catalogs', 'claim_status'], queryFn: () => catalogsApi.findByCategory('claim_status') })
  const { data: currencies = [] } = useQuery({ queryKey: ['catalogs', 'document_currency'], queryFn: () => catalogsApi.findByCategory('document_currency') })

  const preselectedAsset = preselectedAssetId
    ? (allAssets.find((a) => a.id === preselectedAssetId) ?? null)
    : null

  // Titularidad
  const [ownershipType, setOwnershipType] = useState<ClaimOwnershipType | ''>('')
  const [responsiblePersonName, setResponsiblePersonName] = useState('')
  const [thirdPartyInsuranceCompany, setThirdPartyInsuranceCompany] = useState('')
  const [thirdPartyContact, setThirdPartyContact] = useState('')
  const [thirdPartyInsurerContact, setThirdPartyInsurerContact] = useState('')

  // Identity
  const [assetId, setAssetId] = useState(preselectedAssetId)
  const [policyId, setPolicyId] = useState(preselectedPolicyId)
  const [claimType, setClaimType] = useState('')
  const [status, setStatus] = useState('')
  const [occurrenceDate, setOccurrenceDate] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [description, setDescription] = useState('')
  const [insuranceCompany, setInsuranceCompany] = useState('')

  // Amounts + currency
  const [currency, setCurrency] = useState('ARS')
  const [exchangeRate, setExchangeRate] = useState('')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [realAmount, setRealAmount] = useState('')
  const [settledAmount, setSettledAmount] = useState('')
  const [deductible, setDeductible] = useState('')

  const [observations, setObservations] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  // Archivos seleccionados en el form — se suben después de crear el siniestro
  const [pendingDocs, setPendingDocs] = useState<File[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])

  // Derived
  const selectedAsset = assetId ? (allAssets.find((a) => a.id === assetId) ?? null) : null
  const availablePolicies = assetId ? allPolicies.filter((p) => p.assetIds?.includes(assetId)) : allPolicies
  const selectedPolicy = policyId ? availablePolicies.find((p) => p.id === policyId) ?? null : null

  const tc = parseFloat(exchangeRate) || 0
  const toArs = (val: string) => {
    const n = parseFloat(val) || 0
    return currency === 'USD' && tc > 0 ? n * tc : n
  }

  const claimedAmountArs = toArs(claimedAmount)
  const equivalentClaimedAmount =
    currency === 'ARS' && tc > 0
      ? claimedAmountArs / tc
      : currency === 'USD' && tc > 0
        ? claimedAmountArs / tc
        : 0

  const mainPrefix = currency === 'USD' ? 'US$' : 'AR$'
  const altPrefix = currency === 'USD' ? 'AR$' : 'US$'
  const altAmount = currency === 'USD' ? claimedAmountArs : equivalentClaimedAmount

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
    if (!ownershipType) e.ownershipType = 'Indicá si el siniestro es propio o de terceros.'
    if (ownershipType === 'terceros') {
      if (!thirdPartyInsuranceCompany.trim()) e.thirdPartyInsuranceCompany = 'Ingresá la aseguradora del tercero.'
      if (!thirdPartyContact.trim()) e.thirdPartyContact = 'Ingresá el contacto del tercero.'
      if (!thirdPartyInsurerContact.trim()) e.thirdPartyInsurerContact = 'Ingresá el contacto de su aseguradora.'
    }
    if (!claimType) e.claimType = 'Seleccioná el tipo de siniestro.'
    if (!occurrenceDate) e.occurrenceDate = 'Ingresá la fecha del hecho.'
    if (!reportDate) e.reportDate = 'Ingresá la fecha de denuncia.'
    if (!description.trim()) e.description = 'Ingresá una descripción del hecho.'
    if (!insuranceCompany.trim()) e.insuranceCompany = 'Ingresá la compañía aseguradora.'
    if (!claimedAmount || isNaN(Number(claimedAmount)) || Number(claimedAmount) < 0)
      e.claimedAmount = 'Ingresá un monto reclamado válido.'
    if (currency === 'USD' && (!exchangeRate || parseFloat(exchangeRate) <= 0))
      e.exchangeRate = 'Ingresá el tipo de cambio.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)

    try {
      const claimNumber = `SIN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`
      const created = await claimsApi.create({
        claimNumber,
        claimType,
        occurrenceDate,
        reportDate,
        description: description.trim(),
        insuranceCompany: insuranceCompany.trim(),
        ownershipType: ownershipType as 'propio' | 'terceros',
        responsiblePersonName: ownershipType === 'propio' ? (responsiblePersonName.trim() || undefined) : undefined,
        thirdPartyInsuranceCompany: ownershipType === 'terceros' ? thirdPartyInsuranceCompany.trim() : undefined,
        thirdPartyContact: ownershipType === 'terceros' ? thirdPartyContact.trim() : undefined,
        thirdPartyInsurerContact: ownershipType === 'terceros' ? thirdPartyInsurerContact.trim() : undefined,
        status: status || claimStatuses[0]?.label || 'Denunciado',
        currency,
        assetId: assetId || undefined,
        policyId: policyId || undefined,
        claimedAmountArs: toArs(claimedAmount),
        realAmountArs: realAmount ? toArs(realAmount) : undefined,
        settledAmountArs: settledAmount ? toArs(settledAmount) : undefined,
        deductibleArs: deductible ? toArs(deductible) : undefined,
        observations: observations.trim() || undefined,
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      })
      // Subir archivos adjuntos seleccionados en el form
      const allFiles = [
        ...pendingDocs.map((f) => ({ file: f })),
        ...pendingPhotos.map((f) => ({ file: f })),
      ]
      await Promise.all(
        allFiles.map(({ file }) => claimsApi.addAttachment(created.id, file, {})),
      )

      queryClient.invalidateQueries({ queryKey: ['claims'] })
      toast.success('Siniestro registrado correctamente')
      navigate(`/claims/${created.id}`)
    } finally {
      setSubmitting(false)
    }
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

        {/* ── Main: 2/3 ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Sección 0: Titularidad */}
          <SectionCard title="Titularidad del Siniestro" subtitle="¿De quién es este siniestro?">
            <OwnershipTypeFields
              ownershipType={ownershipType}
              onOwnershipTypeChange={(v) => {
                setOwnershipType(v)
                if (errors.ownershipType) setErrors((p) => ({ ...p, ownershipType: undefined }))
              }}
              responsiblePersonName={responsiblePersonName}
              onResponsiblePersonNameChange={setResponsiblePersonName}
              thirdPartyInsuranceCompany={thirdPartyInsuranceCompany}
              onThirdPartyInsuranceCompanyChange={(v) => {
                setThirdPartyInsuranceCompany(v)
                if (errors.thirdPartyInsuranceCompany) setErrors((p) => ({ ...p, thirdPartyInsuranceCompany: undefined }))
              }}
              thirdPartyContact={thirdPartyContact}
              onThirdPartyContactChange={(v) => {
                setThirdPartyContact(v)
                if (errors.thirdPartyContact) setErrors((p) => ({ ...p, thirdPartyContact: undefined }))
              }}
              thirdPartyInsurerContact={thirdPartyInsurerContact}
              onThirdPartyInsurerContactChange={(v) => {
                setThirdPartyInsurerContact(v)
                if (errors.thirdPartyInsurerContact) setErrors((p) => ({ ...p, thirdPartyInsurerContact: undefined }))
              }}
              errors={errors}
            />
          </SectionCard>

          {/* Sección 1: Activo y Póliza */}
          <SectionCard title="Activo y Póliza" subtitle="Asociá el siniestro a un bien asegurado">
            <FormSection title="">
              {/* Activo */}
              <FormField label="Activo asociado">
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
                  <FormSelect value={assetId} onChange={(e) => handleAssetChange(e.target.value)}>
                    <option value="">Sin activo asociado</option>
                    {allAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.internalCode} — {a.name}</option>
                    ))}
                  </FormSelect>
                )}
              </FormField>

              {/* Póliza */}
              <FormField label="Póliza asociada">
                {availablePolicies.length > 0 ? (
                  <>
                    <FormSelect value={policyId} onChange={(e) => handlePolicyChange(e.target.value)}>
                      <option value="">Sin póliza asociada</option>
                      {availablePolicies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.policyNumber} — {p.insuranceType}
                        </option>
                      ))}
                    </FormSelect>
                    {selectedPolicy && (
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedPolicy.coverageType} · Vigencia: {selectedPolicy.endDate}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <TriangleAlert size={13} className="text-slate-400 flex-shrink-0" />
                    <p className="text-xs text-slate-500">
                      {assetId ? 'Sin pólizas asociadas al activo.' : 'Seleccioná un activo primero.'}
                    </p>
                  </div>
                )}
              </FormField>
            </FormSection>

            {/* Coverage chips — actual coverage names from the selected policy */}
            {selectedPolicy && (selectedPolicy.coverageNames?.length ?? 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Coberturas incluidas en esta póliza
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPolicy.coverageNames!.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
                      <CheckCircle2 size={9} />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Sección 2: Tipo de siniestro */}
          <SectionCard
            title="Tipo de Siniestro"
            subtitle="Seleccioná la naturaleza del siniestro para clasificarlo"
          >
            {errors.claimType && (
              <p className="text-xs text-red-500 mb-3">{errors.claimType}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {claimTypes.map(({ id, label }) => {
                const Icon = CLAIM_LABEL_ICON_MAP[label] ?? HelpCircle
                const isSelected = claimType === label

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setClaimType(label)
                      if (errors.claimType) setErrors((p) => ({ ...p, claimType: undefined }))
                    }}
                    className={clsx(
                      'flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div className={clsx(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                      isSelected ? 'bg-blue-100' : 'bg-slate-100',
                    )}>
                      <Icon size={14} className={isSelected ? 'text-blue-600' : 'text-slate-500'} />
                    </div>
                    <span className={clsx(
                      'text-xs font-medium leading-tight',
                      isSelected ? 'text-blue-700' : 'text-slate-700',
                    )}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </SectionCard>

          {/* Sección 3: Datos del hecho */}
          <SectionCard title="Datos del Hecho" subtitle="Fechas y descripción del siniestro">
            <FormSection title="">
              <FormField label="Fecha del hecho" required error={errors.occurrenceDate}>
                <FormInput
                  type="date"
                  value={occurrenceDate}
                  onChange={(e) => { setOccurrenceDate(e.target.value); setErrors((p) => ({ ...p, occurrenceDate: undefined })) }}
                />
              </FormField>

              <FormField label="Fecha de denuncia" required error={errors.reportDate}>
                <FormInput
                  type="date"
                  value={reportDate}
                  onChange={(e) => { setReportDate(e.target.value); setErrors((p) => ({ ...p, reportDate: undefined })) }}
                />
              </FormField>

              <FormField label="Estado inicial">
                <FormSelect
                  value={status || claimStatuses[0]?.label || ''}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {claimStatuses.map((s) => (
                    <option key={s.id} value={s.label}>{s.label}</option>
                  ))}
                </FormSelect>
              </FormField>
            </FormSection>

            <div className="mt-4">
              <FormField label="Descripción del hecho" required error={errors.description}>
                <FormTextarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })) }}
                  rows={4}
                  placeholder="Describí qué ocurrió, cómo y dónde. Incluí detalles relevantes para el trámite."
                />
              </FormField>
            </div>
          </SectionCard>

          {/* Sección 4: Aseguradora */}
          <SectionCard title="Aseguradora" subtitle="Compañía a la que se reporta el siniestro">
            <FormSection title="">
              <FormField label="Compañía aseguradora" required error={errors.insuranceCompany}>
                <FormSelect
                  value={insuranceCompany}
                  onChange={(e) => { setInsuranceCompany(e.target.value); setErrors((p) => ({ ...p, insuranceCompany: undefined })) }}
                >
                  <option value="">Seleccioná una aseguradora</option>
                  {insuranceCompanies.map((c) => (
                    <option key={c.id} value={c.label}>{c.label}</option>
                  ))}
                </FormSelect>
              </FormField>
            </FormSection>
          </SectionCard>

          {/* Sección 5: Importes */}
          <SectionCard title="Importes" subtitle="Moneda, tipo de cambio y montos del siniestro">
            <FormSection title="">
              <FormField label="Moneda">
                <FormSelect value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.length > 0
                    ? currencies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)
                    : <>
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </>
                  }
                </FormSelect>
              </FormField>

              <FormField label="Tipo de Cambio (ARS/USD)" required={currency === 'USD'} error={errors.exchangeRate}>
                <FormInput
                  type="number"
                  placeholder="Ej: 1150"
                  value={exchangeRate}
                  onChange={(e) => { setExchangeRate(e.target.value); setErrors((p) => ({ ...p, exchangeRate: undefined })) }}
                  min="0.01"
                  step="0.01"
                  disabled={currency === 'ARS' && !exchangeRate}
                />
                {currency === 'ARS' && (
                  <p className="text-xs text-slate-400 mt-0.5">Opcional para mostrar equivalente en USD</p>
                )}
              </FormField>

              <FormField label={`Monto reclamado (${mainPrefix})`} required error={errors.claimedAmount}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={claimedAmount}
                  onChange={(e) => { setClaimedAmount(e.target.value); setErrors((p) => ({ ...p, claimedAmount: undefined })) }}
                />
              </FormField>

              <FormField label={`Valor real del siniestro (${mainPrefix})`}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={realAmount}
                  onChange={(e) => setRealAmount(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-0.5">El daño real puede superar el límite cubierto</p>
              </FormField>

              <FormField label={`Monto liquidado (${mainPrefix})`}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={settledAmount}
                  onChange={(e) => setSettledAmount(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-0.5">Completar cuando la aseguradora apruebe</p>
              </FormField>

              <FormField label={`Franquicia (${mainPrefix})`}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={deductible}
                  onChange={(e) => setDeductible(e.target.value)}
                />
              </FormField>
            </FormSection>

            {/* Equivalente */}
            {claimedAmountArs > 0 && tc > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reclamado</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {mainPrefix}{' '}
                    {(parseFloat(claimedAmount) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">
                    <ArrowLeftRight size={11} />
                    Equivalente
                  </span>
                  <span className="text-sm font-bold text-blue-700 tabular-nums">
                    {altPrefix}{' '}
                    {altAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Sección 6: Documentación */}
          <SectionCard title="Documentación Adjunta" subtitle="Denuncias, peritajes, facturas de reparación (PDF, Word)">
            <FileDropzone
              label="Adjuntá documentos del siniestro (denuncia policial, peritaje, presupuestos)"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              maxFiles={10}
              onFilesPicked={(files) => setPendingDocs((prev) => [...prev, ...files])}
            />
          </SectionCard>

          {/* Sección 7: Fotos y Videos */}
          <SectionCard title="Fotos y Videos" subtitle="Evidencia fotográfica y audiovisual del daño">
            <FileDropzone
              label="Adjuntá fotos y videos del siniestro (JPG, PNG, MP4, MOV)"
              accept=".jpg,.jpeg,.png,.gif,.mp4,.mov,.avi,.webm"
              maxFiles={20}
              onFilesPicked={(files) => setPendingPhotos((prev) => [...prev, ...files])}
            />
          </SectionCard>

          {/* Sección 8: Observaciones */}
          <SectionCard title="Observaciones">
            <FormTextarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Notas internas, estado de gestión, contactos en la aseguradora, próximos pasos, etc."
            />
          </SectionCard>
        </div>

        {/* ── Sidebar: 1/3 ──────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Resumen */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow
                label="Titularidad"
                value={ownershipType === 'terceros' ? 'De Terceros' : ownershipType === 'propio' ? 'Propio' : '—'}
              />
              <SummaryRow label="Tipo" value={claimType || '—'} />
              <SummaryRow label="Estado" value={status || claimStatuses[0]?.label || '—'} />
              <SummaryRow label="Activo" value={selectedAsset?.internalCode ?? '—'} />
              <SummaryRow label="Póliza" value={selectedPolicy?.policyNumber ?? '—'} />
              <SummaryRow label="Aseguradora" value={insuranceCompany || '—'} />
              <SummaryRow
                label={`Reclamado (${mainPrefix})`}
                value={claimedAmount ? `${mainPrefix} ${(parseFloat(claimedAmount) || 0).toLocaleString('es-AR')}` : '—'}
              />
              {realAmount && (
                <SummaryRow
                  label={`Valor real (${mainPrefix})`}
                  value={`${mainPrefix} ${(parseFloat(realAmount) || 0).toLocaleString('es-AR')}`}
                />
              )}
              {claimedAmountArs > 0 && tc > 0 && (
                <SummaryRow
                  label={`Equiv. ${altPrefix}`}
                  value={`${altPrefix} ${altAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                />
              )}
            </div>
          </SectionCard>

          {/* Coberturas de la póliza seleccionada — solo informativo */}
          {selectedPolicy && (selectedPolicy.coverageNames?.length ?? 0) > 0 && (
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border bg-slate-50 border-slate-200">
              <ShieldAlert size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">
                  Coberturas de la póliza
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedPolicy.coverageNames!.map((name) => (
                    <span key={name} className="text-[10px] text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-xl">
            <ShieldAlert size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              El número de siniestro se genera automáticamente. Podés actualizarlo luego con el número asignado por la aseguradora.
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
              {submitting ? 'Guardando…' : 'Registrar siniestro'}
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
