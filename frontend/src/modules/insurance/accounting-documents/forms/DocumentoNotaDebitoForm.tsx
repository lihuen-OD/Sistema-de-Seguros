import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Info } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { FormSection, FormField, FormInput, FormSelect, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { DocumentRelationSelector } from '../components/DocumentRelationSelector'
import { DocumentImpactPreview } from '../components/DocumentImpactPreview'
import { InstallmentsEditor, createInitialInstallmentRows, type InstallmentRowData } from '../components/InstallmentsEditor'
import { DocumentFormFooter } from '../components/DocumentFormFooter'
import { DocumentAttachmentsCard } from '../components/DocumentAttachmentsCard'
import { useSavedDocState } from '../hooks/useSavedDocState'
import { useDuplicateDocumentNumberCheck } from '../hooks/useDuplicateDocumentNumberCheck'
import { documentsApi, documentKeys, documentQueries } from '../../../../shared/api/documents.api'
import { catalogQueries } from '../../../../shared/api/catalogs.api'
import type { AccountingDocument } from '../../../../shared/types'

interface DocumentoNotaDebitoFormProps {
  initialDoc?: AccountingDocument
}

interface FormState {
  insuranceCompany: string
  documentNumber: string
  issueDate: string
  linkedDocumentId: string
  currency: string
  exchangeRate: string
  paymentMethod: string
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
  description: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

export default function DocumentoNotaDebitoForm({ initialDoc }: DocumentoNotaDebitoFormProps) {
  const isEdit = !!initialDoc
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>({
    insuranceCompany: initialDoc?.insuranceCompany ?? '',
    documentNumber: initialDoc?.documentNumber ?? '',
    issueDate: initialDoc?.issueDate ?? '',
    linkedDocumentId: initialDoc?.linkedDocumentId ?? '',
    currency: initialDoc?.currency ?? '',
    exchangeRate: initialDoc ? String(initialDoc.exchangeRate) : '',
    paymentMethod: initialDoc?.paymentMethod ?? '',
    netAmount: initialDoc ? String(initialDoc.netAmount) : '',
    vatAmount: initialDoc ? String(initialDoc.vatAmount) : '0',
    otherTaxesAmount: initialDoc ? String(initialDoc.otherTaxesAmount) : '0',
    description: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [installmentCount, setInstallmentCount] = useState(1)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRowData[]>(createInitialInstallmentRows())
  const [installmentsInitialized, setInstallmentsInitialized] = useState(!isEdit)

  const { savedDocId, isSaved, markUnsaved, markSaved } = useSavedDocState(initialDoc?.id)
  const { dupWarning, dupChecking } = useDuplicateDocumentNumberCheck(form.documentNumber, !isEdit, 'DEBIT_NOTE', form.insuranceCompany)

  const { data: allDocuments = [] } = useQuery(documentQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))
  const { data: paymentMethods = [] } = useQuery(catalogQueries.byCategory('document_payment_method'))
  const { data: currencies = [] } = useQuery(catalogQueries.byCategory('document_currency'))

  const { data: existingInstallments = [], isSuccess: installmentsLoaded } = useQuery({
    ...documentQueries.installments(initialDoc?.id ?? ''),
    enabled: isEdit,
  })
  if (installmentsLoaded && !installmentsInitialized) {
    setInstallmentsInitialized(true)
    if (existingInstallments.length > 0) {
      const rows = existingInstallments.map((i) => ({ installmentNumber: i.installmentNumber, dueDate: i.dueDate, amount: String(i.amount) }))
      setInstallmentRows(rows)
      setInstallmentCount(rows.length)
    }
  }

  const linkableInvoices = allDocuments.filter(
    (d) =>
      d.documentType === 'INVOICE' &&
      d.documentStatus !== 'CANCELLED' &&
      (!isEdit || d.id !== initialDoc!.id) &&
      (!form.insuranceCompany || d.insuranceCompany === form.insuranceCompany),
  )
  const linkedInvoice = allDocuments.find((d) => d.id === form.linkedDocumentId) ?? null

  const parsedNet = parseFloat(form.netAmount) || 0
  const parsedVat = parseFloat(form.vatAmount) || 0
  const parsedOther = parseFloat(form.otherTaxesAmount) || 0
  const computedTotal = parsedNet + parsedVat + parsedOther
  const tc = parseFloat(form.exchangeRate) || 0
  const mainPrefix = form.currency === 'USD' ? 'US$' : 'AR$'
  const equivalentPrefix = form.currency === 'ARS' ? 'US$' : 'AR$'
  const equivalentAmount =
    form.currency === 'ARS' && tc > 0 ? computedTotal / tc : form.currency === 'USD' && tc > 0 ? computedTotal * tc : 0

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key as keyof FormErrors]) setErrors((prev) => ({ ...prev, [key]: undefined }))
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
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const installmentsInput = installmentRows
    .filter((r) => r.dueDate && parseFloat(r.amount) > 0)
    .map((r) => ({ installmentNumber: r.installmentNumber, dueDate: r.dueDate, amount: parseFloat(r.amount) }))

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        documentType: 'DEBIT_NOTE',
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        currency: form.currency,
        exchangeRate: tc,
        netAmount: parsedNet,
        vatAmount: parsedVat,
        otherTaxesAmount: parsedOther,
        insuranceCompany: form.insuranceCompany,
        paymentMethod: form.paymentMethod,
        description: form.description || undefined,
        linkedDocumentId: form.linkedDocumentId || undefined,
        allocations: [],
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
        description: form.description || undefined,
        linkedDocumentId: form.linkedDocumentId || undefined,
      })
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

  return (
    <PageContent>
      <PageHeader
        title={isEdit ? `Editar ${initialDoc!.documentNumber}` : 'Nueva Nota de Débito'}
        subtitle="Aumenta el saldo de una factura, o funciona como documento propio"
        backTo={isEdit ? `/insurance/documents/${initialDoc!.id}` : '/insurance/documents'}
        backLabel={isEdit ? 'Volver al documento' : 'Volver a documentos'}
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        <SectionCard title="Identificación" subtitle="Compañía y datos del documento">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect value={form.insuranceCompany} onChange={set('insuranceCompany')} required>
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
                <FormInput placeholder="Ej: ND-0001-00000123" value={form.documentNumber} onChange={set('documentNumber')} required />
                {dupChecking && <p className="mt-1 text-xs text-slate-400">Verificando número…</p>}
                {!dupChecking && dupWarning && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-snug">
                      Ya existe un documento con el número <strong>{form.documentNumber.trim()}</strong>.
                    </p>
                  </div>
                )}
              </FormField>
            )}

            <FormField label="Fecha de Emisión" required error={errors.issueDate}>
              <FormInput type="date" value={form.issueDate} onChange={set('issueDate')} required />
            </FormField>

            <FormField label="Factura asociada (opcional)" fullWidth>
              <DocumentRelationSelector
                documents={linkableInvoices}
                value={form.linkedDocumentId}
                onChange={(id) => { setForm((p) => ({ ...p, linkedDocumentId: id })); markUnsaved() }}
                emptyMessage="No hay facturas disponibles para vincular."
                helperText="Si no se asocia a ninguna factura, esta Nota de Débito funciona como documento propio pagable."
              />
            </FormField>

            <FormField label="Observaciones" fullWidth>
              <FormTextarea rows={2} value={form.description} onChange={set('description')} placeholder="Observaciones adicionales…" />
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
            <FormField label="Tipo de Cambio" required error={errors.exchangeRate}>
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
            <FormField label="IVA">
              <FormInput type="number" placeholder="0.00" value={form.vatAmount} onChange={set('vatAmount')} min="0" step="0.01" />
            </FormField>
            <FormField label="Otros Impuestos">
              <FormInput type="number" placeholder="0.00" value={form.otherTaxesAmount} onChange={set('otherTaxesAmount')} min="0" step="0.01" />
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

          <div className="mt-3">
            <DocumentImpactPreview
              documentType="DEBIT_NOTE"
              linkedDocument={linkedInvoice}
              amount={computedTotal}
              currency={form.currency || 'ARS'}
            />
          </div>
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

        <DocumentFormFooter isSubmitting={isSubmitting} isSaved={isSaved} savedDocId={savedDocId} />
      </form>
    </PageContent>
  )
}
