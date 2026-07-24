import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, CheckCircle2, ArrowLeftRight, X, Info } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { FormSection, FormField, FormInput, FormSelect } from '../../../../shared/components/forms/FormSection'
import { PolicySelector, createEmptyPolicyRow, type PolicyAllocationRow } from '../../../../shared/components/forms/PolicySelector'
import { InstallmentsEditor, createInitialInstallmentRows, type InstallmentRowData } from '../components/InstallmentsEditor'
import { DocumentFormFooter } from '../components/DocumentFormFooter'
import { DocumentAttachmentsCard } from '../components/DocumentAttachmentsCard'
import { useSavedDocState } from '../hooks/useSavedDocState'
import { useDuplicateDocumentNumberCheck } from '../hooks/useDuplicateDocumentNumberCheck'
import { documentsApi, documentKeys, documentQueries } from '../../../../shared/api/documents.api'
import { policyQueries } from '../../../../shared/api/policies.api'
import { catalogQueries } from '../../../../shared/api/catalogs.api'
import { notifyValidationErrors } from '../../../../shared/utils/formValidation'
import type { AccountingDocument } from '../../../../shared/types'

interface DocumentoFacturaFormProps {
  initialDoc?: AccountingDocument
  sourcePolicyId?: string
}

interface FormState {
  insuranceCompany: string
  documentNumber: string
  issueDate: string
  currency: string
  exchangeRate: string
  paymentMethod: string
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
}

type FormErrors = Partial<Record<keyof FormState | 'policies', string>>

export default function DocumentoFacturaForm({ initialDoc, sourcePolicyId }: DocumentoFacturaFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!initialDoc

  const [form, setForm] = useState<FormState>({
    insuranceCompany: initialDoc?.insuranceCompany ?? '',
    documentNumber: initialDoc?.documentNumber ?? '',
    issueDate: initialDoc?.issueDate ?? '',
    currency: initialDoc?.currency ?? '',
    exchangeRate: initialDoc ? String(initialDoc.exchangeRate) : '',
    paymentMethod: initialDoc?.paymentMethod ?? '',
    netAmount: initialDoc ? String(initialDoc.netAmount) : '',
    vatAmount: initialDoc ? String(initialDoc.vatAmount) : '',
    otherTaxesAmount: initialDoc ? String(initialDoc.otherTaxesAmount) : '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [policyRows, setPolicyRows] = useState<PolicyAllocationRow[]>([createEmptyPolicyRow()])
  const [allocationsInitialized, setAllocationsInitialized] = useState(!isEdit)
  const [installmentCount, setInstallmentCount] = useState(1)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRowData[]>(createInitialInstallmentRows())
  const [installmentsInitialized, setInstallmentsInitialized] = useState(!isEdit)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubjectEdit, setEmailSubjectEdit] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'skipped'>('idle')

  const { savedDocId, isSaved, markUnsaved, markSaved } = useSavedDocState(initialDoc?.id)
  const { dupWarning, dupChecking } = useDuplicateDocumentNumberCheck(form.documentNumber, !isEdit, 'INVOICE', form.insuranceCompany)

  const { data: allPolicies = [] } = useQuery(policyQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))
  const { data: paymentMethods = [] } = useQuery(catalogQueries.byCategory('document_payment_method'))
  const { data: currencies = [] } = useQuery(catalogQueries.byCategory('document_currency'))

  const { data: sourcePolicy } = useQuery({
    ...policyQueries.detail(sourcePolicyId!),
    enabled: !isEdit && !!sourcePolicyId,
  })

  const { data: existingAllocations = [], isSuccess: allocationsLoaded } = useQuery({
    ...documentQueries.allocations(initialDoc?.id ?? ''),
    enabled: isEdit,
  })
  const { data: existingInstallments = [], isSuccess: installmentsLoaded } = useQuery({
    ...documentQueries.installments(initialDoc?.id ?? ''),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!sourcePolicy) return
    setForm((prev) => ({
      ...prev,
      insuranceCompany: sourcePolicy.insuranceCompany,
      currency: sourcePolicy.currency,
      exchangeRate: sourcePolicy.exchangeRate > 1 ? sourcePolicy.exchangeRate.toString() : prev.exchangeRate,
      documentNumber: sourcePolicy.policyNumber,
    }))
    setPolicyRows([{ id: crypto.randomUUID(), policyId: sourcePolicy.id, allocatedAmount: '' }])
  }, [sourcePolicy])

  if (allocationsLoaded && !allocationsInitialized) {
    setAllocationsInitialized(true)
    if (existingAllocations.length > 0) {
      setPolicyRows(existingAllocations.map((a) => ({
        id: crypto.randomUUID(),
        policyId: a.policyId,
        allocatedAmount: String(a.allocatedAmount),
      })))
    }
  }
  if (installmentsLoaded && !installmentsInitialized) {
    setInstallmentsInitialized(true)
    if (existingInstallments.length > 0) {
      const rows = existingInstallments.map((i) => ({
        installmentNumber: i.installmentNumber,
        dueDate: i.dueDate,
        amount: String(i.amount),
      }))
      setInstallmentRows(rows)
      setInstallmentCount(rows.length)
    }
  }

  const parsedNet = parseFloat(form.netAmount) || 0
  const parsedVat = parseFloat(form.vatAmount) || 0
  const parsedOther = parseFloat(form.otherTaxesAmount) || 0
  const computedTotal = parsedNet + parsedVat + parsedOther
  const tc = parseFloat(form.exchangeRate) || 0
  const mainPrefix = form.currency === 'USD' ? 'US$' : 'AR$'
  const equivalentPrefix = form.currency === 'ARS' ? 'US$' : 'AR$'
  const equivalentAmount =
    form.currency === 'ARS' && tc > 0 ? computedTotal / tc : form.currency === 'USD' && tc > 0 ? computedTotal * tc : 0

  const totalAllocated = policyRows.reduce((s, r) => s + (parseFloat(r.allocatedAmount) || 0), 0)

  const availablePolicies = isEdit
    ? allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany)
    : allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany && (p.status === 'vigente' || p.status === 'proximo_vencer'))

  const distribution = policyRows
    .filter((r) => r.policyId && parseFloat(r.allocatedAmount) > 0)
    .map((r) => {
      const policy = allPolicies.find((p) => p.id === r.policyId)
      const amount = parseFloat(r.allocatedAmount) || 0
      const pct = totalAllocated > 0 ? (amount / totalAllocated) * 100 : 0
      return { policy, amount, pct }
    })

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    markUnsaved()
  }

  const handleInsuranceCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, insuranceCompany: e.target.value }))
    if (!isEdit) setPolicyRows([createEmptyPolicyRow()])
    if (errors.insuranceCompany) setErrors((prev) => ({ ...prev, insuranceCompany: undefined }))
    markUnsaved()
  }

  const validate = (): boolean => {
    const next: FormErrors = {}
    if (!form.insuranceCompany) next.insuranceCompany = 'Requerido'
    if (!form.documentNumber.trim()) next.documentNumber = 'Requerido'
    if (!form.issueDate) next.issueDate = 'Requerido'
    if (!form.currency) next.currency = 'Requerido'
    if (!form.exchangeRate || parseFloat(form.exchangeRate) <= 0) next.exchangeRate = 'Requerido'
    if (!form.paymentMethod) next.paymentMethod = 'Requerido'
    if (!form.netAmount || isNaN(parseFloat(form.netAmount))) next.netAmount = 'Requerido'
    if (!form.vatAmount || isNaN(parseFloat(form.vatAmount))) next.vatAmount = 'Requerido'
    if (!form.otherTaxesAmount || isNaN(parseFloat(form.otherTaxesAmount))) next.otherTaxesAmount = 'Requerido'
    if (policyRows.length === 0 || policyRows.every((r) => !r.policyId)) next.policies = 'Asociá al menos una póliza'
    setErrors(next)
    notifyValidationErrors(next)
    return Object.keys(next).length === 0
  }

  const allocationsInput = policyRows
    .filter((r) => r.policyId && parseFloat(r.allocatedAmount) > 0)
    .map((r) => ({
      policyId: r.policyId,
      allocatedAmount: parseFloat(r.allocatedAmount),
      allocationPercentage: totalAllocated > 0 ? (parseFloat(r.allocatedAmount) / totalAllocated) * 100 : 0,
    }))

  const installmentsInput = installmentRows
    .filter((r) => r.dueDate && parseFloat(r.amount) > 0)
    .map((r) => ({ installmentNumber: r.installmentNumber, dueDate: r.dueDate, amount: parseFloat(r.amount) }))

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        documentType: 'INVOICE',
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        currency: form.currency,
        exchangeRate: tc,
        netAmount: parsedNet,
        vatAmount: parsedVat,
        otherTaxesAmount: parsedOther,
        insuranceCompany: form.insuranceCompany,
        paymentMethod: form.paymentMethod,
        allocations: allocationsInput,
        installments: installmentsInput,
      }),
  })

  const updateMutation = useMutation({
    mutationFn: async (docId: string) => {
      await documentsApi.update(docId, {
        issueDate: form.issueDate,
        currency: form.currency,
        exchangeRate: tc,
        netAmount: parsedNet,
        vatAmount: parsedVat,
        otherTaxesAmount: parsedOther,
        insuranceCompany: form.insuranceCompany,
        paymentMethod: form.paymentMethod,
      })
      await documentsApi.replaceAllocations(docId, allocationsInput)
      await documentsApi.replaceInstallments(docId, installmentsInput)
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || isSubmitting) return
    if (savedDocId) {
      await updateMutation.mutateAsync(savedDocId)
      markSaved(savedDocId)
    } else {
      const newDoc = await createMutation.mutateAsync()
      markSaved(newDoc.id)
    }
    queryClient.invalidateQueries({ queryKey: documentKeys.all })
  }

  const handleSendEmail = async () => {
    if (!emailTo.trim() || !savedDocId || emailStatus === 'sending') return
    setEmailStatus('sending')
    try {
      const result = await documentsApi.sendEmail(savedDocId, {
        to: [emailTo.trim()],
        subject: emailSubjectEdit || undefined,
      })
      if (result.status === 'SKIPPED') {
        setEmailStatus('skipped')
      } else {
        setEmailStatus('sent')
        setTimeout(() => { setEmailModalOpen(false); setEmailStatus('idle'); setEmailTo('') }, 1800)
      }
    } catch {
      // El toast de error ya lo muestra el interceptor de apiClient.
      setEmailStatus('idle')
    }
  }

  const savedPolicyNumbers = policyRows
    .filter((r) => r.policyId)
    .map((r) => allPolicies.find((p) => p.id === r.policyId)?.policyNumber)
    .filter(Boolean) as string[]
  const emailSubject = savedPolicyNumbers.length > 0
    ? `Documento póliza ${savedPolicyNumbers.join(', ')} — ${form.insuranceCompany}`
    : `Documento ${form.documentNumber} — ${form.insuranceCompany}`

  return (
    <PageContent>
      <PageHeader
        title={isEdit ? `Editar ${initialDoc!.documentNumber}` : 'Nueva Factura'}
        subtitle="Genera deuda/costo — se asocia a una o varias pólizas"
        backTo={isEdit ? `/insurance/documents/${initialDoc!.id}` : '/insurance/documents'}
        backLabel={isEdit ? 'Volver al documento' : 'Volver a documentos'}
      />

      {sourcePolicy && (
        <div className="mb-4 max-w-5xl flex items-center gap-2 px-4 py-2.5 bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-lg">
          <Info size={14} className="flex-shrink-0" />
          <span>
            Datos pre-completados desde la póliza <strong>{sourcePolicy.policyNumber}</strong> ({sourcePolicy.insuranceCompany}). Podés editarlos.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        <SectionCard title="Identificación" subtitle="Compañía y datos del documento">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect value={form.insuranceCompany} onChange={handleInsuranceCompanyChange} required>
                <option value="">Seleccionar compañía…</option>
                {insuranceCompanies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </FormSelect>
            </FormField>

            {isEdit ? (
              <FormField label="N° de Documento">
                <FormInput value={form.documentNumber} readOnly disabled className="bg-slate-50 text-slate-500 cursor-not-allowed" />
                <p className="text-xs text-slate-400 mt-1">El número de documento no puede modificarse.</p>
              </FormField>
            ) : (
              <FormField label="N° de Documento" required error={errors.documentNumber}>
                <FormInput placeholder="Ej: A-0001-00012345" value={form.documentNumber} onChange={set('documentNumber')} required />
                {dupChecking && <p className="mt-1 text-xs text-slate-400">Verificando número…</p>}
                {!dupChecking && dupWarning && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-snug">
                      Ya existe un documento con el número <strong>{form.documentNumber.trim()}</strong>. Podés guardarlo igual.
                    </p>
                  </div>
                )}
              </FormField>
            )}

            <FormField label="Fecha de Emisión" required error={errors.issueDate}>
              <FormInput type="date" value={form.issueDate} onChange={set('issueDate')} required />
            </FormField>
          </FormSection>
        </SectionCard>

        <SectionCard title="Importes y Pago" subtitle="Moneda, tipo de cambio y forma de pago">
          <FormSection title="">
            <FormField label="Moneda" required error={errors.currency}>
              <FormSelect value={form.currency} onChange={set('currency')} required>
                <option value="">Seleccionar moneda…</option>
                {currencies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Tipo de Cambio (ARS/USD)" required error={errors.exchangeRate}>
              <FormInput type="number" placeholder="Ej: 1150" value={form.exchangeRate} onChange={set('exchangeRate')} min="0.01" step="0.01" required />
            </FormField>
            <FormField label="Forma de Pago" required error={errors.paymentMethod}>
              <FormSelect value={form.paymentMethod} onChange={set('paymentMethod')} required>
                <option value="">Seleccionar forma…</option>
                {paymentMethods.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Neto" required error={errors.netAmount}>
              <FormInput type="number" placeholder="0.00" value={form.netAmount} onChange={set('netAmount')} min="0" step="0.01" required />
            </FormField>
            <FormField label="IVA" required error={errors.vatAmount}>
              <FormInput type="number" placeholder="0.00" value={form.vatAmount} onChange={set('vatAmount')} min="0" step="0.01" required />
            </FormField>
            <FormField label="Otros Impuestos" required error={errors.otherTaxesAmount}>
              <FormInput type="number" placeholder="0.00" value={form.otherTaxesAmount} onChange={set('otherTaxesAmount')} min="0" step="0.01" required />
            </FormField>
          </FormSection>

          {computedTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
                <span className="text-base font-bold text-slate-800 tabular-nums">
                  {mainPrefix} {computedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {tc > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-brand-50 rounded-xl border border-brand-100">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 uppercase tracking-wider">
                    <ArrowLeftRight size={12} /> Equivalente
                  </span>
                  <span className="text-base font-bold text-brand-700 tabular-nums">
                    {equivalentPrefix} {equivalentAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Pólizas Asociadas"
          subtitle={form.insuranceCompany ? `Pólizas de ${form.insuranceCompany}` : 'Seleccioná primero la compañía aseguradora'}
        >
          {errors.policies && <p className="text-xs text-red-500 mb-3">{errors.policies}</p>}
          <PolicySelector
            mode="multi"
            policies={availablePolicies}
            rows={policyRows}
            onRowsChange={(rows) => { setPolicyRows(rows); markUnsaved() }}
            currencyPrefix={mainPrefix}
            emptyMessage={!form.insuranceCompany ? 'Seleccioná una compañía aseguradora para ver sus pólizas.' : `No hay pólizas para ${form.insuranceCompany}.`}
          />
        </SectionCard>

        <SectionCard title="Cuotas" subtitle="Cantidad de cuotas, fechas e importes">
          <InstallmentsEditor
            count={installmentCount}
            rows={installmentRows}
            computedTotal={computedTotal}
            currencyPrefix={mainPrefix}
            onChange={(count, rows) => { setInstallmentCount(count); setInstallmentRows(rows); markUnsaved() }}
          />
        </SectionCard>

        <DocumentAttachmentsCard isSaved={isSaved} savedDocId={savedDocId} />

        <DocumentFormFooter isSubmitting={isSubmitting} isSaved={isSaved} savedDocId={savedDocId}>
          <button
            type="button"
            disabled={!isSaved}
            onClick={() => { setEmailSubjectEdit(emailSubject); setEmailModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!isSaved ? 'Guardá primero el documento para poder enviarlo' : 'Enviar por mail'}
          >
            <Mail size={15} />
            Enviar por mail
          </button>
        </DocumentFormFooter>
      </form>

      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => emailStatus !== 'sending' && setEmailModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                  <Mail size={16} className="text-brand-600" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800">Enviar por mail</h2>
              </div>
              {emailStatus !== 'sending' && emailStatus !== 'sent' && (
                <button type="button" onClick={() => setEmailModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {emailStatus === 'sent' ? (
              <div className="px-6 py-10 text-center">
                <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-slate-800">Mail enviado</p>
                <p className="text-xs text-slate-400 mt-1">Cerrando…</p>
              </div>
            ) : emailStatus === 'skipped' ? (
              <div className="px-6 py-10 text-center">
                <Info size={40} className="mx-auto text-amber-500 mb-3" />
                <p className="text-sm font-semibold text-slate-800">Envío deshabilitado en este entorno</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  El intento quedó registrado, pero el servicio de email no está activo acá. No se mandó ningún mail.
                </p>
                <button
                  type="button"
                  onClick={() => { setEmailModalOpen(false); setEmailStatus('idle') }}
                  className="mt-4 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Para <span className="text-red-500">*</span></label>
                  <input type="email" placeholder="destinatario@ejemplo.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Asunto</label>
                  <input type="text" value={emailSubjectEdit} onChange={(e) => setEmailSubjectEdit(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all" />
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contenido del mail</p>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Forma de pago</span>
                      <span className="text-xs font-semibold text-slate-700">{form.paymentMethod || '—'}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">Distribución por póliza</p>
                      {distribution.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin pólizas asignadas.</p>
                      ) : (
                        <div className="space-y-2">
                          {distribution.map(({ policy, amount, pct }, i) => (
                            <div key={i} className="flex items-start justify-between gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                              <p className="text-xs font-semibold text-slate-700">{policy?.policyNumber ?? '—'}</p>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-bold text-brand-600">{pct.toFixed(1).replace('.', ',')}%</p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {mainPrefix} {amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  <button type="button" onClick={handleSendEmail} disabled={!emailTo.trim() || emailStatus === 'sending'}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <Mail size={14} /> {emailStatus === 'sending' ? 'Enviando…' : 'Enviar'}
                  </button>
                  <button type="button" onClick={() => setEmailModalOpen(false)} disabled={emailStatus === 'sending'}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
