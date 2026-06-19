import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save,
  X,
  Plus,
  Trash2,
  Calculator,
  Mail,
  CheckCircle2,
  ArrowLeftRight,
  Paperclip,
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
import { documentsApi } from '../../../shared/api/documents.api'
import { policiesApi } from '../../../shared/api/policies.api'
import { catalogsApi } from '../../../shared/api/catalogs.api'
import { DocumentAttachmentsSection } from './DocumentAttachmentsSection'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyRowData {
  id: string
  policyId: string
  allocatedAmount: string
}

interface InstallmentRow {
  installmentNumber: number
  dueDate: string
  amount: string
}

interface DocumentForm {
  insuranceCompany: string
  documentType: string
  documentNumber: string
  issueDate: string
  currency: string
  exchangeRate: string
  paymentMethod: string
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
  linkedDocumentId: string
}

type FormErrors = Partial<Record<keyof DocumentForm | 'policies', string>>

const INITIAL_FORM: DocumentForm = {
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
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<DocumentForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [policyRows, setPolicyRows] = useState<PolicyRowData[]>([
    { id: crypto.randomUUID(), policyId: '', allocatedAmount: '' },
  ])
  const [installmentCount, setInstallmentCount] = useState(1)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRow[]>([
    { installmentNumber: 1, dueDate: '', amount: '' },
  ])
  const [isSaved, setIsSaved] = useState(false)
  const [savedDocId, setSavedDocId] = useState<string | null>(null)
  const [savedPolicyNumbers, setSavedPolicyNumbers] = useState<string[]>([])
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const { data: allPolicies = [] } = useQuery({
    queryKey: ['policies'],
    queryFn: () => policiesApi.findAll(),
  })

  const { data: allDocuments = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.findAll(),
  })

  const { data: insuranceCompanies = [] } = useQuery({ queryKey: ['catalogs', 'insurance_company'], queryFn: () => catalogsApi.findByCategory('insurance_company') })
  const { data: documentTypes = [] } = useQuery({ queryKey: ['catalogs', 'document_type'], queryFn: () => catalogsApi.findByCategory('document_type') })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['catalogs', 'document_payment_method'], queryFn: () => catalogsApi.findByCategory('document_payment_method') })
  const { data: currencies = [] } = useQuery({ queryKey: ['catalogs', 'document_currency'], queryFn: () => catalogsApi.findByCategory('document_currency') })

  const existingFacturas = useMemo(
    () => allDocuments.filter((d) => d.documentType === 'Factura'),
    [allDocuments],
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

  // Only active policies from the selected insurance company
  const availablePolicies = useMemo(() => {
    if (!form.insuranceCompany) return []
    return allPolicies.filter(
      (p) =>
        p.insuranceCompany === form.insuranceCompany &&
        (p.status === 'vigente' || p.status === 'proximo_vencer'),
    )
  }, [allPolicies, form.insuranceCompany])

  const isRefDoc =
    form.documentType === 'Nota de Crédito' || form.documentType === 'Endoso'

  // Distribution for email modal
  const distribution = useMemo(
    () =>
      policyRows
        .filter((r) => r.policyId && parseFloat(r.allocatedAmount) > 0)
        .map((r) => {
          const policy = allPolicies.find((p) => p.id === r.policyId)
          const amount = parseFloat(r.allocatedAmount) || 0
          const pct = totalAllocated > 0 ? (amount / totalAllocated) * 100 : 0
          return { policy, amount, pct }
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

  const updatePolicyRow = (
    rowId: string,
    field: 'policyId' | 'allocatedAmount',
    value: string,
  ) => {
    setPolicyRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)))
    markUnsaved()
  }

  // ─── Installments ────────────────────────────────────────────────────────────

  const rebuildInstallments = useCallback(
    (count: number, total: number) => {
      const per = count > 0 && total > 0 ? total / count : 0
      const rows: InstallmentRow[] = Array.from({ length: count }, (_, i) => ({
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
  }

  const handleAutoDistribute = () => rebuildInstallments(installmentCount, computedTotal)

  const updateInstallmentRow = (idx: number, field: 'dueDate' | 'amount', value: string) => {
    setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
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
    if (!form.otherTaxesAmount || isNaN(parseFloat(form.otherTaxesAmount)))
      next.otherTaxesAmount = 'Requerido'
    if (policyRows.length === 0 || policyRows.every((r) => !r.policyId))
      next.policies = 'Asociá al menos una póliza'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const validRows = policyRows.filter((r) => r.policyId)
    const policyNumbers = validRows
      .map((r) => allPolicies.find((p) => p.id === r.policyId)?.policyNumber)
      .filter(Boolean) as string[]

    const newDoc = await documentsApi.create({
      documentType: form.documentType,
      documentNumber: form.documentNumber.trim(),
      issueDate: form.issueDate,
      currency: form.currency,
      exchangeRate: tc,
      netAmount: parsedNet,
      vatAmount: parsedVat,
      otherTaxesAmount: parsedOther,
      insuranceCompany: form.insuranceCompany,
      paymentMethod: form.paymentMethod,
      linkedDocumentId: isRefDoc && form.linkedDocumentId ? form.linkedDocumentId : undefined,
    })

    queryClient.invalidateQueries({ queryKey: ['documents'] })
    setSavedDocId(newDoc.id)
    setSavedPolicyNumbers(policyNumbers)
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

  const emailSubject =
    savedPolicyNumbers.length > 0
      ? `Documento póliza ${savedPolicyNumbers.join(', ')} — ${form.insuranceCompany}`
      : ''

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Documento Contable"
        subtitle="Factura, nota de crédito o endoso"
        backTo="/insurance/documents"
        backLabel="Volver a documentos"
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">

        {/* ── Sección 1: Identificación ────────────────────────────────────── */}
        <SectionCard title="Identificación" subtitle="Compañía, tipo y datos del documento">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect
                value={form.insuranceCompany}
                onChange={handleInsuranceCompanyChange}
                required
              >
                <option value="">Seleccionar compañía…</option>
                {insuranceCompanies.map((c) => (
                  <option key={c.id} value={c.label}>{c.label}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Tipo de Documento" required error={errors.documentType}>
              <FormSelect value={form.documentType} onChange={set('documentType')} required>
                <option value="">Seleccionar tipo…</option>
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.label}>{t.label}</option>
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
              <FormInput
                type="date"
                value={form.issueDate}
                onChange={set('issueDate')}
                required
              />
            </FormField>

            {/* Factura de referencia — solo para NC y Endoso */}
            {isRefDoc && (
              <FormField
                label="Factura de referencia"
                fullWidth
              >
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
                  Una {form.documentType} siempre está asociada a una factura preexistente. La imputación sobre cuotas se gestiona desde la póliza.
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
                {currencies.map((c) => (
                  <option key={c.id} value={c.label}>{c.label}</option>
                ))}
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
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.label}>{m.label}</option>
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

          {/* Total + Equivalente */}
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
              ? `Pólizas activas de ${form.insuranceCompany}`
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
                Seleccioná una compañía aseguradora para ver sus pólizas activas.
              </p>
            </div>
          ) : availablePolicies.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
              <p className="text-sm text-slate-400">
                No hay pólizas activas para <strong>{form.insuranceCompany}</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center px-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Póliza
                </span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                  Importe asignado
                </span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                  Participación
                </span>
                <span />
              </div>

              {policyRows.map((row) => {
                const allocated = parseFloat(row.allocatedAmount) || 0
                const pct = totalAllocated > 0 ? (allocated / totalAllocated) * 100 : 0

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
                  </div>
                )
              })}

              {/* Total asignado */}
              {policyRows.length > 1 && (
                <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 pl-1">
                    Total asignado
                  </span>
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
        <SectionCard title="Cuotas" subtitle="Cantidad de cuotas, fechas e importes">
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
        <SectionCard
          title="Documentación Adjunta"
          subtitle={isSaved ? 'Podés agregar o quitar archivos adjuntos' : 'Guardá el documento primero para adjuntar archivos'}
          noPadding
        >
          {isSaved && savedDocId ? (
            <DocumentAttachmentsSection documentId={savedDocId} />
          ) : (
            <div className="px-5 py-8 text-center">
              <Paperclip size={20} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">Guardá el documento para adjuntar la factura PDF u otros archivos</p>
            </div>
          )}
        </SectionCard>

        {/* ── Acciones ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-2 pb-6 flex-wrap">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save size={15} />
            Guardar Documento
          </button>

          <button
            type="button"
            disabled={!isSaved}
            onClick={() => setEmailModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!isSaved ? 'Guardá primero el documento para poder enviarlo' : 'Enviar por mail'}
          >
            <Mail size={15} />
            Enviar por mail
          </button>

          <button
            type="button"
            onClick={() => navigate('/insurance/documents')}
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
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !emailSent && setEmailModalOpen(false)}
          />

          {/* Modal card */}
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
            {/* Header */}
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
                {/* Para */}
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

                {/* Asunto */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Asunto</label>
                  <input
                    type="text"
                    value={emailSubject}
                    readOnly
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-default"
                  />
                </div>

                {/* Contenido del mail */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Contenido del mail
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-3">

                    {/* Forma de pago */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Forma de pago</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {form.paymentMethod || '—'}
                      </span>
                    </div>

                    {/* Distribución */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">Distribución por póliza</p>
                      {distribution.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin pólizas asignadas.</p>
                      ) : (
                        <div className="space-y-2">
                          {distribution.map(({ policy, amount, pct }, i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100"
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="text-xs font-semibold text-slate-700">
                                  {policy?.policyNumber ?? '—'}
                                </p>
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

                    {/* Adjuntos */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs text-slate-500">Adjuntos</span>
                      <span className="text-xs text-slate-400 italic">Ver en la plataforma</span>
                    </div>
                  </div>
                </div>

                {/* Acciones del modal */}
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
