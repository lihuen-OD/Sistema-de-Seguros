import { useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { FormSection, FormField, FormInput, FormSelect, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { DocumentRelationSelector } from '../components/DocumentRelationSelector'
import { DocumentImpactPreview } from '../components/DocumentImpactPreview'
import { DocumentBalanceSummary } from '../components/DocumentBalanceSummary'
import { DocumentFormFooter } from '../components/DocumentFormFooter'
import { DocumentAttachmentsCard } from '../components/DocumentAttachmentsCard'
import { useSavedDocState } from '../hooks/useSavedDocState'
import { useDuplicateDocumentNumberCheck } from '../hooks/useDuplicateDocumentNumberCheck'
import { documentsApi, documentKeys, documentQueries } from '../../../../shared/api/documents.api'
import { catalogQueries } from '../../../../shared/api/catalogs.api'
import type { AccountingDocument } from '../../../../shared/types'

interface DocumentoNotaCreditoFormProps {
  initialDoc?: AccountingDocument
}

interface FormState {
  insuranceCompany: string
  documentNumber: string
  issueDate: string
  linkedDocumentId: string
  currency: string
  exchangeRate: string
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
  description: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

export default function DocumentoNotaCreditoForm({ initialDoc }: DocumentoNotaCreditoFormProps) {
  const isEdit = !!initialDoc
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>({
    insuranceCompany: initialDoc?.insuranceCompany ?? '',
    documentNumber: initialDoc?.documentNumber ?? '',
    issueDate: initialDoc?.issueDate ?? '',
    linkedDocumentId: initialDoc?.linkedDocumentId ?? '',
    currency: initialDoc?.currency ?? '',
    exchangeRate: initialDoc ? String(initialDoc.exchangeRate) : '',
    netAmount: initialDoc ? String(initialDoc.netAmount) : '',
    vatAmount: initialDoc ? String(initialDoc.vatAmount) : '0',
    otherTaxesAmount: initialDoc ? String(initialDoc.otherTaxesAmount) : '0',
    description: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const { savedDocId, isSaved, markUnsaved, markSaved } = useSavedDocState(initialDoc?.id)
  const { dupWarning, dupChecking } = useDuplicateDocumentNumberCheck(form.documentNumber, !isEdit, 'CREDIT_NOTE', form.insuranceCompany)

  const { data: allDocuments = [] } = useQuery(documentQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))
  const { data: currencies = [] } = useQuery(catalogQueries.byCategory('document_currency'))

  // Facturas candidatas: mismo tipo, no anuladas, misma compañía. Se resuelve
  // el saldo de cada una para excluir las que ya no tienen saldo disponible.
  const candidateInvoices = allDocuments.filter(
    (d) => d.documentType === 'INVOICE' && d.documentStatus !== 'CANCELLED' && d.insuranceCompany === form.insuranceCompany,
  )
  const balanceQueries = useQueries({
    queries: candidateInvoices.map((inv) => ({
      ...documentQueries.balance(inv.id),
      enabled: !!form.insuranceCompany,
    })),
  })
  const linkableInvoices = candidateInvoices.filter((inv, idx) => {
    if (isEdit && inv.id === form.linkedDocumentId) return true // ya vinculada, aunque su saldo actual sea 0
    const balance = balanceQueries[idx]?.data
    return balance ? balance.effectiveAmount > 0 : true // mientras carga, no ocultar
  })

  const linkedInvoice = allDocuments.find((d) => d.id === form.linkedDocumentId) ?? null
  const { data: linkedBalance } = useQuery(documentQueries.balance(form.linkedDocumentId))

  const parsedNet = parseFloat(form.netAmount) || 0
  const parsedVat = parseFloat(form.vatAmount) || 0
  const parsedOther = parseFloat(form.otherTaxesAmount) || 0
  const computedTotal = parsedNet + parsedVat + parsedOther
  const tc = parseFloat(form.exchangeRate) || 0
  const mainPrefix = form.currency === 'USD' ? 'US$' : 'AR$'

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key as keyof FormErrors]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    markUnsaved()
  }

  const handleInsuranceCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, insuranceCompany: e.target.value, linkedDocumentId: '' }))
    markUnsaved()
  }

  const validate = (): boolean => {
    const next: FormErrors = {}
    if (!form.insuranceCompany) next.insuranceCompany = 'Requerido'
    if (!form.documentNumber.trim()) next.documentNumber = 'Requerido'
    if (!form.issueDate) next.issueDate = 'Requerido'
    if (!form.linkedDocumentId) next.linkedDocumentId = 'La factura asociada es requerida'
    if (!form.currency) next.currency = 'Requerido'
    if (!form.exchangeRate || parseFloat(form.exchangeRate) <= 0) next.exchangeRate = 'Requerido'
    if (!form.netAmount || isNaN(parseFloat(form.netAmount)) || parsedNet <= 0) next.netAmount = 'Requerido'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        documentType: 'CREDIT_NOTE',
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        currency: form.currency,
        exchangeRate: tc,
        netAmount: parsedNet,
        vatAmount: parsedVat,
        otherTaxesAmount: parsedOther,
        insuranceCompany: form.insuranceCompany,
        description: form.description || undefined,
        linkedDocumentId: form.linkedDocumentId,
        // La NC no admite pólizas/cuotas manuales — el backend genera sus
        // propias asignaciones (negativas) al aplicarla.
        allocations: [],
        installments: [],
      }),
  })

  const updateMutation = useMutation({
    mutationFn: (docId: string) =>
      documentsApi.update(docId, {
        issueDate: form.issueDate,
        currency: form.currency,
        exchangeRate: tc,
        netAmount: parsedNet,
        vatAmount: parsedVat,
        otherTaxesAmount: parsedOther,
        insuranceCompany: form.insuranceCompany,
        description: form.description || undefined,
        linkedDocumentId: form.linkedDocumentId,
      }),
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
        title={isEdit ? `Editar ${initialDoc!.documentNumber}` : 'Nueva Nota de Crédito'}
        subtitle="Reduce el saldo de una factura — aplica automáticamente al confirmarse"
        backTo={isEdit ? `/insurance/documents/${initialDoc!.id}` : '/insurance/documents'}
        backLabel={isEdit ? 'Volver al documento' : 'Volver a documentos'}
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        <SectionCard title="Identificación" subtitle="Compañía, factura asociada y datos del documento">
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
                <FormInput placeholder="Ej: NC-0001-00000123" value={form.documentNumber} onChange={set('documentNumber')} required />
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

            <FormField
              label="Factura asociada"
              required
              error={errors.linkedDocumentId}
              fullWidth
            >
              <DocumentRelationSelector
                documents={linkableInvoices}
                value={form.linkedDocumentId}
                onChange={(id) => { setForm((p) => ({ ...p, linkedDocumentId: id })); markUnsaved() }}
                required
                emptyMessage={
                  !form.insuranceCompany
                    ? 'Seleccioná primero la compañía aseguradora.'
                    : 'No hay facturas con saldo disponible para esta compañía.'
                }
              />
            </FormField>

            <FormField label="Motivo / Descripción" fullWidth>
              <FormTextarea rows={2} value={form.description} onChange={set('description')} placeholder="Ej: corrección de prima, error de facturación…" />
            </FormField>
          </FormSection>
        </SectionCard>

        <SectionCard title="Importes" subtitle="Moneda y monto del crédito">
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
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
              <span className="text-base font-bold text-slate-800 tabular-nums">
                {mainPrefix} {computedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
            <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-snug">
              La distribución por póliza de esta Nota de Crédito se calcula automáticamente, proporcional a la de
              la factura de referencia, en el momento en que se aplique.
            </p>
          </div>

          <div className="mt-3">
            <DocumentImpactPreview
              documentType="CREDIT_NOTE"
              linkedDocument={linkedInvoice}
              amount={computedTotal}
              currency={form.currency || 'ARS'}
            />
          </div>
        </SectionCard>

        {linkedInvoice && linkedBalance && (
          <SectionCard title="Saldo actual de la factura seleccionada" subtitle={linkedInvoice.documentNumber}>
            <DocumentBalanceSummary balance={linkedBalance} currency={linkedInvoice.currency} hasPaymentStatus />
          </SectionCard>
        )}

        <DocumentAttachmentsCard isSaved={isSaved} savedDocId={savedDocId} />

        <DocumentFormFooter isSubmitting={isSubmitting} isSaved={isSaved} savedDocId={savedDocId} />
      </form>
    </PageContent>
  )
}
