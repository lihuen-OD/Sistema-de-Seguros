import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Save,
  X,
  Plus,
  Trash2,
  Calculator,
  Mail,
  CheckCircle2,
  ArrowLeftRight,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import {
  FormSection,
  FormField,
  FormInput,
  FormSelect,
} from '../../../shared/components/forms/FormSection'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { DocumentAttachmentsSection } from './DocumentAttachmentsSection'
import { policyRepository } from '../../../services/repositories/policy.repository'
import { accountingDocumentRepository } from '../../../services/repositories/accounting-document.repository'
import { assetRepository } from '../../../services/repositories/asset.repository'
import { costCenterRepository } from '../../../services/repositories/cost-center.repository'
import {
  INSURANCE_COMPANIES,
  DOCUMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../../shared/constants'
import { ROUTES } from '../../../app/routes'
import type { Currency, DocumentType, PaymentMethod } from '../../../shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyRowData {
  id: string
  policyId: string
  allocatedAmount: string
}

interface InstallmentRowData {
  installmentNumber: number
  dueDate: string
  amount: string
}

interface DocumentForm {
  insuranceCompany: string
  documentType: string
  documentNumber: string
  issueDate: string
  currency: Currency | ''
  exchangeRate: string
  paymentMethod: PaymentMethod | ''
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
  linkedDocumentId: string
}

type FormErrors = Partial<Record<keyof DocumentForm | 'policies', string>>

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const doc = accountingDocumentRepository.findById(id!)
  const existingAllocations = doc
    ? accountingDocumentRepository.findAllocationsByDocument(doc.id)
    : []
  const existingInstallments = doc
    ? accountingDocumentRepository.findInstallmentsByDocument(doc.id)
    : []

  // Must be before early return to satisfy rules of hooks
  const [form, setForm] = useState<DocumentForm>(() =>
    doc
      ? {
          insuranceCompany: doc.insuranceCompany ?? '',
          documentType: doc.documentType,
          documentNumber: doc.documentNumber,
          issueDate: doc.issueDate,
          currency: doc.currency,
          exchangeRate: String(doc.exchangeRate),
          paymentMethod: doc.paymentMethod ?? '',
          netAmount: String(doc.netAmount),
          vatAmount: String(doc.vatAmount),
          otherTaxesAmount: String(doc.otherTaxesAmount),
          linkedDocumentId: doc.linkedDocumentId ?? '',
        }
      : {
          insuranceCompany: '',
          documentType: '',
          documentNumber: '',
          issueDate: '',
          currency: '',
          exchangeRate: '',
          paymentMethod: '',
          netAmount: '',
          vatAmount: '',
          otherTaxesAmount: '',
          linkedDocumentId: '',
        },
  )

  const [errors, setErrors] = useState<FormErrors>({})

  const [policyRows, setPolicyRows] = useState<PolicyRowData[]>(() =>
    existingAllocations.length > 0
      ? existingAllocations.map((a) => ({
          id: a.id,
          policyId: a.policyId,
          allocatedAmount: String(Math.abs(a.allocatedAmount)),
        }))
      : [{ id: crypto.randomUUID(), policyId: '', allocatedAmount: '' }],
  )

  const [installmentCount, setInstallmentCount] = useState(() => existingInstallments.length || 1)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRowData[]>(() =>
    existingInstallments.length > 0
      ? existingInstallments.map((i) => ({
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate,
          amount: String(Math.abs(i.amount)),
        }))
      : [{ installmentNumber: 1, dueDate: '', amount: '' }],
  )

  const [isSaved, setIsSaved] = useState(true)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  if (!doc) {
    return (
      <PageContent>
        <EmptyState
          title="Documento no encontrado"
          description="El documento solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  const allPolicies = policyRepository.findAll()
  const existingFacturas = useMemo(
    () => accountingDocumentRepository.findByDocumentType('factura').filter((f) => f.id !== doc.id),
    [],
  )

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const parsedNet = parseFloat(form.netAmount) || 0
  const parsedVat = parseFloat(form.vatAmount) || 0
  const parsedOther = parseFloat(form.otherTaxesAmount) || 0
  const computedTotal = parsedNet + parsedVat + parsedOther
  const tc = parseFloat(form.exchangeRate) || 0

  const equivalentAmount =
    form.currency === 'ARS' && tc > 0
      ? computedTotal / tc
      : form.currency === 'USD' && tc > 0
        ? computedTotal * tc
        : 0
  const mainPrefix = form.currency === 'USD' ? 'US$' : 'AR$'
  const equivalentPrefix = form.currency === 'ARS' ? 'US$' : 'AR$'

  const totalAllocated = useMemo(
    () => policyRows.reduce((s, r) => s + (parseFloat(r.allocatedAmount) || 0), 0),
    [policyRows],
  )

  // All policies for selected company (no status filter — edit must show existing allocations)
  const availablePolicies = useMemo(() => {
    if (!form.insuranceCompany) return []
    return allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany)
  }, [allPolicies, form.insuranceCompany])

  const isRefDoc = form.documentType === 'nota_credito' || form.documentType === 'endoso'

  const distribution = useMemo(
    () =>
      policyRows
        .filter((r) => r.policyId && parseFloat(r.allocatedAmount) > 0)
        .map((r) => {
          const policy = allPolicies.find((p) => p.id === r.policyId)
          const asset = policy?.assetId
            ? assetRepository.findById(policy.assetId!)
            : null
          const costCenter = policy?.costCenterId
            ? costCenterRepository.findById(policy.costCenterId!)
            : null
          const amount = parseFloat(r.allocatedAmount) || 0
          const pct = totalAllocated > 0 ? (amount / totalAllocated) * 100 : 0
          return { policy, asset, costCenter, amount, pct }
        }),
    [policyRows, allPolicies, totalAllocated],
  )

  // ─── Setters ─────────────────────────────────────────────────────────────────

  const markUnsaved = () => { if (isSaved) setIsSaved(false) }

  const set =
    (key: keyof DocumentForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
      markUnsaved()
    }

  const handleInsuranceCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, insuranceCompany: e.target.value }))
    setPolicyRows([{ id: crypto.randomUUID(), policyId: '', allocatedAmount: '' }])
    if (errors.insuranceCompany) setErrors((prev) => ({ ...prev, insuranceCompany: undefined }))
    markUnsaved()
  }

  // ─── Policy rows ─────────────────────────────────────────────────────────────

  const addPolicyRow = () => {
    setPolicyRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), policyId: '', allocatedAmount: '' },
    ])
    markUnsaved()
  }

  const removePolicyRow = (rowId: string) => {
    setPolicyRows((prev) => prev.filter((r) => r.id !== rowId))
    markUnsaved()
  }

  const updatePolicyRow = (rowId: string, field: 'policyId' | 'allocatedAmount', value: string) => {
    setPolicyRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)))
    markUnsaved()
  }

  // ─── Installments ────────────────────────────────────────────────────────────

  const rebuildInstallments = useCallback(
    (count: number, total: number) => {
      const per = count > 0 && total > 0 ? total / count : 0
      const rows: InstallmentRowData[] = Array.from({ length: count }, (_, i) => ({
        installmentNumber: i + 1,
        dueDate: installmentRows[i]?.dueDate ?? '',
        amount: per > 0 ? per.toFixed(2) : '',
      }))
      setInstallmentRows(rows)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installmentRows],
  )

  const handleInstallmentCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = Math.max(1, Math.min(60, parseInt(e.target.value) || 1))
    setInstallmentCount(count)
    rebuildInstallments(count, computedTotal)
    markUnsaved()
  }

  const handleAutoDistribute = () => {
    rebuildInstallments(installmentCount, computedTotal)
    markUnsaved()
  }

  const updateInstallmentRow = (idx: number, field: 'dueDate' | 'amount', value: string) => {
    setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
    markUnsaved()
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const next: FormErrors = {}
    if (!form.insuranceCompany) next.insuranceCompany = 'Requerido'
    if (!form.documentType) next.documentType = 'Requerido'
    if (!form.documentNumber.trim()) next.documentNumber = 'Requerido'
    if (!form.issueDate) next.issueDate = 'Requerido'
    if (!form.currency) next.currency = 'Requerido'
    if (!form.exchangeRate || parseFloat(form.exchangeRate) <= 0) next.exchangeRate = 'Requerido'
    if (!form.paymentMethod) next.paymentMethod = 'Requerido'
    if (!form.netAmount || isNaN(parseFloat(form.netAmount))) next.netAmount = 'Requerido'
    if (!form.vatAmount || isNaN(parseFloat(form.vatAmount))) next.vatAmount = 'Requerido'
    if (!form.otherTaxesAmount || isNaN(parseFloat(form.otherTaxesAmount))) next.otherTaxesAmount = 'Requerido'
    if (policyRows.length === 0 || policyRows.every((r) => !r.policyId))
      next.policies = 'Asociá al menos una póliza'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const validRows = policyRows.filter((r) => r.policyId)

    accountingDocumentRepository.update(doc.id, {
      documentType: form.documentType as DocumentType,
      documentNumber: form.documentNumber.trim(),
      issueDate: form.issueDate,
      currency: form.currency as Currency,
      exchangeRate: tc,
      netAmount: parsedNet,
      vatAmount: parsedVat,
      otherTaxesAmount: parsedOther,
      totalAmount: computedTotal,
      insuranceCompany: form.insuranceCompany,
      paymentMethod: form.paymentMethod as PaymentMethod,
      linkedDocumentId: isRefDoc && form.linkedDocumentId ? form.linkedDocumentId : undefined,
    })

    const total = totalAllocated || computedTotal
    accountingDocumentRepository.replaceAllocations(
      doc.id,
      validRows.map((r) => {
        const amount = parseFloat(r.allocatedAmount) || 0
        return {
          policyId: r.policyId,
          allocatedAmount: amount,
          allocationPercentage: total > 0 ? (amount / total) * 100 : 0,
        }
      }),
    )

    accountingDocumentRepository.replaceInstallments(
      doc.id,
      installmentRows.map((r) => ({
        installmentNumber: r.installmentNumber,
        dueDate: r.dueDate,
        amount: parseFloat(r.amount) || 0,
      })),
      form.currency as Currency,
    )

    setIsSaved(true)
  }

  // ─── Email ──────────────────────────────────────────────────────────────────

  const handleSendEmail = () => {
    if (!emailTo.trim()) return
    setEmailSent(true)
    setTimeout(() => {
      setEmailModalOpen(false)
      setEmailSent(false)
      setEmailTo('')
    }, 1800)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const emailSubject = `Documento ${doc.documentNumber} — ${form.insuranceCompany}`

  return (
    <PageContent>
      <PageHeader
        title={`Editar ${doc.documentNumber}`}
        subtitle={`${DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} · Emisión: ${doc.issueDate}`}
        backTo={ROUTES.DOCUMENTS_DETAIL(doc.id)}
        backLabel="Volver al documento"
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">

        {/* ── Sección 1: Identificación ────────────────────────────────────── */}
        <SectionCard title="Identificación" subtitle="Compañía, tipo y datos del documento">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect value={form.insuranceCompany} onChange={handleInsuranceCompanyChange} required>
                <option value="">Seleccionar compañía…</option>
                {INSURANCE_COMPANIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Tipo de Documento" required error={errors.documentType}>
              <FormSelect value={form.documentType} onChange={set('documentType')} required>
                <option value="">Seleccionar tipo…</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="N° de Documento" required error={errors.documentNumber}>
              <FormInput
                placeholder="Ej: A-0001-00012345"
                value={form.documentNumber}
                onChange={set('documentNumber')}
                required
              />
            </FormField>

            <FormField label="Fecha de Emisión" required error={errors.issueDate}>
              <FormInput type="date" value={form.issueDate} onChange={set('issueDate')} required />
            </FormField>

            {isRefDoc && (
              <FormField label="Factura de referencia" fullWidth>
                <FormSelect value={form.linkedDocumentId} onChange={set('linkedDocumentId')}>
                  <option value="">Seleccionar factura base…</option>
                  {existingFacturas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.documentNumber} — {f.issueDate} — {f.currency === 'USD' ? 'US$' : 'AR$'}{' '}
                      {f.totalAmount.toLocaleString('es-AR')}
                    </option>
                  ))}
                </FormSelect>
                <p className="text-xs text-slate-400 mt-1">
                  Una {DOCUMENT_TYPE_LABELS[form.documentType]} siempre está asociada a una factura preexistente.
                </p>
              </FormField>
            )}
          </FormSection>
        </SectionCard>

        {/* ── Sección 2: Importes y Forma de Pago ─────────────────────────── */}
        <SectionCard title="Importes y Pago" subtitle="Moneda, tipo de cambio y forma de pago">
          <FormSection title="">
            <FormField label="Moneda" required error={errors.currency}>
              <FormSelect value={form.currency} onChange={set('currency')} required>
                <option value="">Seleccionar moneda…</option>
                <option value="ARS">ARS — Pesos Argentinos</option>
                <option value="USD">USD — Dólares</option>
              </FormSelect>
            </FormField>

            <FormField label="Tipo de Cambio (ARS/USD)" required error={errors.exchangeRate}>
              <FormInput
                type="number"
                placeholder="Ej: 1150"
                value={form.exchangeRate}
                onChange={set('exchangeRate')}
                min="0.01"
                step="0.01"
                required
              />
            </FormField>

            <FormField label="Forma de Pago" required error={errors.paymentMethod}>
              <FormSelect value={form.paymentMethod} onChange={set('paymentMethod')} required>
                <option value="">Seleccionar forma…</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Neto" required error={errors.netAmount}>
              <FormInput
                type="number"
                placeholder="0.00"
                value={form.netAmount}
                onChange={set('netAmount')}
                min="0"
                step="0.01"
                required
              />
            </FormField>

            <FormField label="IVA" required error={errors.vatAmount}>
              <FormInput
                type="number"
                placeholder="0.00"
                value={form.vatAmount}
                onChange={set('vatAmount')}
                min="0"
                step="0.01"
                required
              />
            </FormField>

            <FormField label="Otros Impuestos" required error={errors.otherTaxesAmount}>
              <FormInput
                type="number"
                placeholder="0.00"
                value={form.otherTaxesAmount}
                onChange={set('otherTaxesAmount')}
                min="0"
                step="0.01"
                required
              />
            </FormField>
          </FormSection>

          {computedTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
                <span className="text-base font-bold text-slate-800 tabular-nums">
                  {mainPrefix}{' '}
                  {computedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {tc > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">
                    <ArrowLeftRight size={12} />
                    Equivalente
                  </span>
                  <span className="text-base font-bold text-blue-700 tabular-nums">
                    {equivalentPrefix}{' '}
                    {equivalentAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── Sección 3: Pólizas Asociadas ─────────────────────────────────── */}
        <SectionCard
          title="Pólizas Asociadas"
          subtitle={
            form.insuranceCompany
              ? `Pólizas de ${form.insuranceCompany}`
              : 'Seleccioná primero la compañía aseguradora para filtrar las pólizas'
          }
          actions={
            form.insuranceCompany ? (
              <button
                type="button"
                onClick={addPolicyRow}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus size={13} />
                Agregar póliza
              </button>
            ) : undefined
          }
        >
          {errors.policies && (
            <p className="text-xs text-red-500 mb-3">{errors.policies}</p>
          )}

          {!form.insuranceCompany ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
              <p className="text-sm text-slate-400">
                Seleccioná una compañía aseguradora para ver sus pólizas.
              </p>
            </div>
          ) : availablePolicies.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
              <p className="text-sm text-slate-400">
                No hay pólizas para <strong>{form.insuranceCompany}</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center px-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Póliza</span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Importe asignado</span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Participación</span>
                <span />
              </div>

              {policyRows.map((row) => {
                const allocated = parseFloat(row.allocatedAmount) || 0
                const pct = totalAllocated > 0 ? (allocated / totalAllocated) * 100 : 0
                const selectedPolicy = availablePolicies.find((p) => p.id === row.policyId)
                const asset = selectedPolicy?.assetId
                  ? assetRepository.findById(selectedPolicy.assetId!)
                  : null
                const costCenter = selectedPolicy?.costCenterId
                  ? costCenterRepository.findById(selectedPolicy.costCenterId!)
                  : null

                return (
                  <div key={row.id} className="space-y-1.5">
                    <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center">
                      <FormSelect
                        value={row.policyId}
                        onChange={(e) => updatePolicyRow(row.id, 'policyId', e.target.value)}
                      >
                        <option value="">Seleccionar póliza…</option>
                        {availablePolicies.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.policyNumber} — {p.insuranceType}
                          </option>
                        ))}
                      </FormSelect>

                      <FormInput
                        type="number"
                        placeholder="0.00"
                        value={row.allocatedAmount}
                        onChange={(e) => updatePolicyRow(row.id, 'allocatedAmount', e.target.value)}
                        min="0"
                        step="0.01"
                        className="text-right"
                      />

                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 tabular-nums w-10 text-right">
                          {pct.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePolicyRow(row.id)}
                        disabled={policyRows.length === 1}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {selectedPolicy && (asset || costCenter) && (
                      <div className="flex items-center gap-2 pl-1 flex-wrap">
                        {asset && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-slate-50 border border-slate-200 text-slate-600">
                            <span className="text-slate-400 font-medium">Bien de Uso:</span>
                            {asset.fixedAssetCode} — {asset.name}
                          </span>
                        )}
                        {costCenter && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-slate-50 border border-slate-200 text-slate-600">
                            <span className="text-slate-400 font-medium">C. Costo:</span>
                            {costCenter.code} — {costCenter.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {policyRows.length > 1 && (
                <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 pl-1">Total asignado</span>
                  <span className="text-xs font-bold text-slate-800 tabular-nums text-right pr-1">
                    {mainPrefix}{' '}
                    {totalAllocated.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-bold text-blue-600 text-right pr-1">100%</span>
                  <span />
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── Sección 4: Cuotas ────────────────────────────────────────────── */}
        <SectionCard
          title="Cuotas"
          subtitle="Cantidad, fechas e importes. El estado de pago se mantiene para cuotas existentes."
        >
          <div className="flex items-end gap-4 mb-5 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Cantidad de cuotas</label>
              <FormInput
                type="number"
                value={String(installmentCount)}
                onChange={handleInstallmentCountChange}
                min="1"
                max="60"
                className="w-28"
              />
            </div>
            <button
              type="button"
              onClick={handleAutoDistribute}
              disabled={computedTotal <= 0}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Calculator size={13} />
              Distribuir automáticamente
            </button>
            {computedTotal > 0 && installmentCount > 0 && (
              <p className="text-xs text-slate-400">
                {mainPrefix}{' '}
                {(computedTotal / installmentCount).toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                por cuota
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[40px_1fr_1fr] gap-3 px-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">N°</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vencimiento</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Importe</span>
            </div>

            {installmentRows.map((row, idx) => (
              <div key={row.installmentNumber} className="grid grid-cols-[40px_1fr_1fr] gap-3 items-center">
                <span className="text-xs font-bold text-slate-400 tabular-nums text-center">
                  {String(row.installmentNumber).padStart(2, '0')}
                </span>
                <FormInput
                  type="date"
                  value={row.dueDate}
                  onChange={(e) => updateInstallmentRow(idx, 'dueDate', e.target.value)}
                />
                <FormInput
                  type="number"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) => updateInstallmentRow(idx, 'amount', e.target.value)}
                  min="0"
                  step="0.01"
                  className="text-right"
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Sección 5: Adjuntos ──────────────────────────────────────────── */}
        <SectionCard title="Documentación Adjunta" subtitle="Factura PDF, endosos o documentación relacionada" noPadding>
          <DocumentAttachmentsSection documentId={doc.id} />
        </SectionCard>

        {/* ── Acciones ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-2 pb-6 flex-wrap">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save size={15} />
            Guardar cambios
          </button>

          <button
            type="button"
            disabled={!isSaved}
            onClick={() => setEmailModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!isSaved ? 'Guardá los cambios primero para poder enviar' : 'Enviar por mail'}
          >
            <Mail size={15} />
            Enviar por mail
          </button>

          <button
            type="button"
            onClick={() => navigate(ROUTES.DOCUMENTS_DETAIL(doc.id))}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
          >
            <X size={15} />
            Cancelar
          </button>

          {isSaved && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={14} />
              Guardado
            </span>
          )}
        </div>
      </form>

      {/* ── Modal: Enviar por mail ──────────────────────────────────────────── */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !emailSent && setEmailModalOpen(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Mail size={16} className="text-blue-600" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800">Enviar por mail</h2>
              </div>
              {!emailSent && (
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {emailSent ? (
              <div className="px-6 py-10 text-center">
                <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-slate-800">Mail enviado</p>
                <p className="text-xs text-slate-400 mt-1">Cerrando…</p>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    Para <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="destinatario@ejemplo.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Asunto</label>
                  <input
                    type="text"
                    value={emailSubject}
                    readOnly
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-default"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Contenido del mail
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Forma de pago</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {PAYMENT_METHOD_LABELS[form.paymentMethod] ?? '—'}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">Distribución por póliza</p>
                      {distribution.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin pólizas asignadas.</p>
                      ) : (
                        <div className="space-y-2">
                          {distribution.map(({ policy, asset, costCenter, amount, pct }, i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100"
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="text-xs font-semibold text-slate-700">
                                  {policy?.policyNumber ?? '—'}
                                </p>
                                {asset && (
                                  <p className="text-xs text-slate-500">
                                    Bien de Uso: {asset.fixedAssetCode} — {asset.name}
                                  </p>
                                )}
                                {costCenter && (
                                  <p className="text-xs text-slate-500">
                                    C. Costo: {costCenter.code} — {costCenter.name}
                                  </p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-bold text-blue-600">
                                  {pct.toFixed(1).replace('.', ',')}%
                                </p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {mainPrefix}{' '}
                                  {amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs text-slate-500">Adjuntos</span>
                      <span className="text-xs text-slate-400 italic">Ver en la plataforma</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={!emailTo.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Mail size={14} />
                    Enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContent>
  )
}
