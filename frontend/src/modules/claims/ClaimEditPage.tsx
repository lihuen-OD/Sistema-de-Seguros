import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Save, AlertTriangle, FileText, ImageIcon, Trash2, Download } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { FileDropzone } from '../../shared/components/file-upload/FileDropzone'
import { claimsApi, claimKeys, claimQueries } from '../../shared/api/claims.api'
import { catalogQueries } from '../../shared/api/catalogs.api'
import { notifyValidationErrors } from '../../shared/utils/formValidation'
import { ROUTES } from '../../app/routes'
import type { ClaimAttachment, ClaimOwnershipType } from '../../shared/types'
import { OwnershipTypeFields } from './OwnershipTypeFields'
import { ClaimExpensesCard } from './ClaimExpensesCard'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 placeholder:text-slate-300 transition-colors'

const selectCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClaimEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: original, isLoading, isError } = useQuery(claimQueries.detail(id!))

  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))
  const { data: claimStatuses = [] } = useQuery(catalogQueries.byCategory('claim_status'))
  const { data: claimTypes = [] } = useQuery(catalogQueries.byCategory('claim_type'))
  const { data: currencies = [] } = useQuery(catalogQueries.byCategory('document_currency'))
  const { data: attachments = [] } = useQuery(claimQueries.attachments(id!))

  const docs = attachments.filter((a) => a.fileType !== 'image')
  const photos = attachments.filter((a) => a.fileType === 'image')

  const handleDeleteAttachment = async (attachmentId: string) => {
    await claimsApi.deleteAttachment(id!, attachmentId)
    queryClient.invalidateQueries({ queryKey: claimKeys.attachments(id!) })
  }

  // ── Form state ──────────────────────────────────────────────────────────────

  const [ownershipType, setOwnershipType] = useState<ClaimOwnershipType | ''>('')
  const [responsiblePersonName, setResponsiblePersonName] = useState('')
  const [thirdPartyInsuranceCompany, setThirdPartyInsuranceCompany] = useState('')
  const [thirdPartyContact, setThirdPartyContact] = useState('')
  const [thirdPartyInsurerContact, setThirdPartyInsurerContact] = useState('')

  const [claimNumber, setClaimNumber] = useState('')
  const [status, setStatus] = useState('')
  const [claimType, setClaimType] = useState('')
  const [occurrenceDate, setOccurrenceDate] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [exchangeRate, setExchangeRate] = useState('')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [realAmount, setRealAmount] = useState('')
  const [settledAmount, setSettledAmount] = useState('')
  const [deductible, setDeductible] = useState('')
  const [observations, setObservations] = useState('')

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Seed form once data loads
  useEffect(() => {
    if (!original) return
    setOwnershipType(original.ownershipType ?? 'propio')
    setResponsiblePersonName(original.responsiblePersonName ?? '')
    setThirdPartyInsuranceCompany(original.thirdPartyInsuranceCompany ?? '')
    setThirdPartyContact(original.thirdPartyContact ?? '')
    setThirdPartyInsurerContact(original.thirdPartyInsurerContact ?? '')
    setClaimNumber(original.claimNumber ?? '')
    setStatus(original.status)
    setClaimType(original.claimType)
    setOccurrenceDate(original.occurrenceDate)
    setReportDate(original.reportDate)
    setInsuranceCompany(original.insuranceCompany)
    setDescription(original.description)
    setCurrency(original.currency ?? 'ARS')
    setExchangeRate(original.exchangeRate != null ? original.exchangeRate.toString() : '')
    setClaimedAmount(original.claimedAmountArs > 0 ? original.claimedAmountArs.toString() : '')
    setRealAmount(original.realAmountArs != null ? original.realAmountArs.toString() : '')
    setSettledAmount(original.settledAmountArs != null ? original.settledAmountArs.toString() : '')
    setDeductible(original.deductibleArs != null ? original.deductibleArs.toString() : '')
    setObservations(original.observations ?? '')
  }, [original])

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-slate-400">Cargando siniestro…</p>
        </div>
      </PageContent>
    )
  }

  if (isError || !original) {
    return (
      <PageContent>
        <ErrorState
          title="Siniestro no encontrado"
          description="El siniestro que intentás editar no existe o fue eliminado."
          action={
            <button
              onClick={() => navigate(ROUTES.CLAIMS)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowLeft size={15} />
              Volver a siniestros
            </button>
          }
        />
      </PageContent>
    )
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const validate = () => {
    const e: Record<string, string> = {}
    if (!ownershipType) e.ownershipType = 'Indicá si el siniestro es propio o de terceros.'
    if (ownershipType === 'terceros') {
      if (!thirdPartyInsuranceCompany.trim()) e.thirdPartyInsuranceCompany = 'Ingresá la aseguradora del tercero.'
      if (!thirdPartyContact.trim()) e.thirdPartyContact = 'Ingresá el contacto del tercero.'
      if (!thirdPartyInsurerContact.trim()) e.thirdPartyInsurerContact = 'Ingresá el contacto de su aseguradora.'
    }
    if (!occurrenceDate) e.occurrenceDate = 'Requerido'
    if (!reportDate) e.reportDate = 'Requerido'
    if (!claimedAmount || isNaN(parseFloat(claimedAmount))) e.claimedAmount = 'Ingresá un monto válido'
    if (!description.trim()) e.description = 'Requerido'
    if (currency === 'USD' && (!exchangeRate || isNaN(parseFloat(exchangeRate)))) {
      e.exchangeRate = 'Ingresá el tipo de cambio'
    }
    setErrors(e)
    notifyValidationErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)

    try {
      await claimsApi.update(original.id, {
        claimNumber: claimNumber.trim() || undefined,
        ownershipType: ownershipType as 'propio' | 'terceros',
        responsiblePersonName: ownershipType === 'propio' ? (responsiblePersonName.trim() || undefined) : undefined,
        thirdPartyInsuranceCompany: ownershipType === 'terceros' ? thirdPartyInsuranceCompany.trim() : undefined,
        thirdPartyContact: ownershipType === 'terceros' ? thirdPartyContact.trim() : undefined,
        thirdPartyInsurerContact: ownershipType === 'terceros' ? thirdPartyInsurerContact.trim() : undefined,
        status,
        claimType,
        occurrenceDate,
        reportDate,
        insuranceCompany,
        description,
        currency,
        claimedAmountArs: parseFloat(claimedAmount),
        realAmountArs: realAmount ? parseFloat(realAmount) : undefined,
        settledAmountArs: settledAmount ? parseFloat(settledAmount) : undefined,
        deductibleArs: deductible ? parseFloat(deductible) : undefined,
        observations: observations.trim() || undefined,
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      })
      queryClient.invalidateQueries({ queryKey: claimKeys.all })
      toast.success('Siniestro actualizado correctamente')
      navigate(ROUTES.CLAIMS_DETAIL(original.id))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageContent>
      <PageHeader
        title={`Editar ${original.claimNumber}`}
        subtitle="Modificar datos del siniestro · Los cambios generan eventos en el historial"
        category="Siniestro"
        backTo={ROUTES.CLAIMS_DETAIL(original.id)}
        backLabel="Volver al siniestro"
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-5">

          {/* Titularidad */}
          <SectionCard title="Titularidad del Siniestro" subtitle="¿De quién es este siniestro?">
            <OwnershipTypeFields
              ownershipType={ownershipType}
              onOwnershipTypeChange={setOwnershipType}
              responsiblePersonName={responsiblePersonName}
              onResponsiblePersonNameChange={setResponsiblePersonName}
              thirdPartyInsuranceCompany={thirdPartyInsuranceCompany}
              onThirdPartyInsuranceCompanyChange={setThirdPartyInsuranceCompany}
              thirdPartyContact={thirdPartyContact}
              onThirdPartyContactChange={setThirdPartyContact}
              thirdPartyInsurerContact={thirdPartyInsurerContact}
              onThirdPartyInsurerContactChange={setThirdPartyInsurerContact}
              errors={errors}
            />
          </SectionCard>

          {/* Estado y tipo */}
          <SectionCard title="Estado y clasificación">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="N° de siniestro (aseguradora)">
                <input
                  type="text"
                  value={claimNumber}
                  onChange={(e) => setClaimNumber(e.target.value)}
                  placeholder="Ej: SIN-2024-00123"
                  className={inputCls}
                />
              </Field>

              <Field label="Estado del siniestro" required>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={selectCls}
                >
                  {claimStatuses.map((s) => (
                    <option key={s.id} value={s.label}>{s.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tipo de siniestro" required>
                <select
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value)}
                  className={selectCls}
                >
                  {claimTypes.map((t) => (
                    <option key={t.id} value={t.label}>{t.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Compañía aseguradora" required>
                <select
                  value={insuranceCompany}
                  onChange={(e) => setInsuranceCompany(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Seleccioná una aseguradora</option>
                  {insuranceCompanies.map((c) => (
                    <option key={c.id} value={c.label}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha del hecho" required>
                <input
                  type="date"
                  value={occurrenceDate}
                  onChange={(e) => setOccurrenceDate(e.target.value)}
                  className={inputCls}
                />
                {errors.occurrenceDate && (
                  <p className="mt-1 text-xs text-red-500">{errors.occurrenceDate}</p>
                )}
              </Field>

              <Field label="Fecha de denuncia" required>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className={inputCls}
                />
                {errors.reportDate && (
                  <p className="mt-1 text-xs text-red-500">{errors.reportDate}</p>
                )}
              </Field>
            </div>
          </SectionCard>

          {/* Montos */}
          <SectionCard title="Montos del siniestro">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="Moneda">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={selectCls}
                >
                  {currencies.length > 0
                    ? currencies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)
                    : <>
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </>
                  }
                </select>
              </Field>

              {currency === 'USD' && (
                <Field label="Tipo de cambio (AR$/USD)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="Ej: 1250.00"
                    className={inputCls}
                  />
                  {errors.exchangeRate && (
                    <p className="mt-1 text-xs text-red-500">{errors.exchangeRate}</p>
                  )}
                </Field>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Monto reclamado (ARS)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                {errors.claimedAmount && (
                  <p className="mt-1 text-xs text-red-500">{errors.claimedAmount}</p>
                )}
              </Field>

              <Field label="Valor real del daño (ARS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={realAmount}
                    onChange={(e) => setRealAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Si el daño real supera el monto reclamado
                </p>
              </Field>

              <Field label="Monto liquidado (ARS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settledAmount}
                    onChange={(e) => setSettledAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Indemnización aprobada por la aseguradora
                </p>
              </Field>

              <Field label="Franquicia (ARS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deductible}
                    onChange={(e) => setDeductible(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Deducible a cargo del asegurado
                </p>
              </Field>
            </div>
          </SectionCard>

          {/* Gastos del siniestro */}
          <ClaimExpensesCard
            claimId={original.id}
            claimedAmountArs={parseFloat(claimedAmount) || original.claimedAmountArs}
          />

          {/* Descripción */}
          <SectionCard title="Descripción y observaciones">
            <div className="space-y-4">
              <Field label="Descripción del hecho" required>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Descripción detallada del siniestro…"
                  className={`${inputCls} resize-none`}
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-red-500">{errors.description}</p>
                )}
              </Field>

              <Field label="Observaciones internas">
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                  placeholder="Notas internas, seguimiento, próximos pasos…"
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Documentación adjunta */}
          <SectionCard
            title="Documentación Adjunta"
            subtitle={docs.length > 0 ? `${docs.length} ${docs.length === 1 ? 'archivo' : 'archivos'}` : 'Denuncias, peritajes, presupuestos'}
          >
            {docs.length > 0 && (
              <div className="divide-y divide-slate-100 mb-4">
                {docs.map((att) => (
                  <EditAttachmentRow key={att.id} claimId={id!} attachment={att} onDelete={handleDeleteAttachment} />
                ))}
              </div>
            )}
            <FileDropzone
              label="Agregar documentos (PDF, Word, Excel)"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              maxFiles={10}
              onFilesSelected={async (files) => {
                for (const file of files) {
                  await claimsApi.addAttachment(original.id, file, {})
                }
                queryClient.invalidateQueries({ queryKey: claimKeys.attachments(original.id) })
              }}
            />
          </SectionCard>

          {/* Fotos y Videos */}
          <SectionCard
            title="Fotos y Videos"
            subtitle={photos.length > 0 ? `${photos.length} ${photos.length === 1 ? 'archivo' : 'archivos'}` : 'Evidencia fotográfica del daño'}
          >
            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                {photos.map((att) => (
                  <EditPhotoCard key={att.id} attachment={att} onDelete={handleDeleteAttachment} />
                ))}
              </div>
            )}
            <FileDropzone
              label="Agregar fotos y videos (JPG, PNG, MP4)"
              accept=".jpg,.jpeg,.png,.gif,.mp4,.mov,.avi,.webm"
              maxFiles={20}
              onFilesSelected={async (files) => {
                for (const file of files) {
                  await claimsApi.addAttachment(original.id, file, {})
                }
                queryClient.invalidateQueries({ queryKey: claimKeys.attachments(original.id) })
              }}
            />
          </SectionCard>

          {/* Notice */}
          <div className="flex items-start gap-3 px-4 py-3 bg-brand-50 border border-brand-200 rounded-xl">
            <AlertTriangle size={15} className="text-brand-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-brand-700">
              Cada cambio significativo genera un evento automático en el historial del siniestro.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.CLAIMS_DETAIL(original.id))}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Save size={15} />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>

        </div>
      </form>
    </PageContent>
  )
}

function EditAttachmentRow({
  claimId,
  attachment,
  onDelete,
}: {
  claimId: string
  attachment: ClaimAttachment
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <FileText size={14} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{attachment.name}</p>
        <p className="text-xs text-slate-400">{attachment.fileSize}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {attachment.fileUrl && !attachment.fileUrl.startsWith('local://') && (
          <button
            type="button"
            onClick={() => claimsApi.downloadAttachment(claimId, attachment.id, attachment.name)}
            className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"
            title="Descargar"
          >
            <Download size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(attachment.id)}
          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function EditPhotoCard({
  attachment,
  onDelete,
}: {
  attachment: ClaimAttachment
  onDelete: (id: string) => void
}) {
  const hasUrl = attachment.fileUrl && !attachment.fileUrl.startsWith('local://')
  return (
    <div className="relative group rounded-xl border border-slate-200 overflow-hidden">
      {hasUrl ? (
        <div className="aspect-square bg-slate-100 overflow-hidden">
          <img
            src={attachment.fileUrl}
            alt={attachment.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-square bg-slate-100 flex items-center justify-center">
          <ImageIcon size={24} className="text-slate-400" />
        </div>
      )}
      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
        <p className="text-[11px] text-slate-500 truncate flex-1">{attachment.name}</p>
        <button
          type="button"
          onClick={() => onDelete(attachment.id)}
          className="p-0.5 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
          title="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
