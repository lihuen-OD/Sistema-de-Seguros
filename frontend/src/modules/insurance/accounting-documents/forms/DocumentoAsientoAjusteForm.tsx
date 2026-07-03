import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { FormSection, FormField, FormInput, FormSelect, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { DocumentRelationSelector } from '../components/DocumentRelationSelector'
import { DocumentImpactPreview } from '../components/DocumentImpactPreview'
import { DocumentFormFooter } from '../components/DocumentFormFooter'
import { DocumentAttachmentsCard } from '../components/DocumentAttachmentsCard'
import { useSavedDocState } from '../hooks/useSavedDocState'
import { useDuplicateDocumentNumberCheck } from '../hooks/useDuplicateDocumentNumberCheck'
import { documentsApi } from '../../../../shared/api/documents.api'
import { catalogsApi } from '../../../../shared/api/catalogs.api'
import type { AccountingDocument, AdjustmentSign, DocumentType } from '../../../../shared/types'

const ADJUSTABLE_TYPES: DocumentType[] = ['INVOICE', 'DEBIT_NOTE', 'CREDIT_NOTE', 'REBILLING']

interface DocumentoAsientoAjusteFormProps {
  initialDoc?: AccountingDocument
}

interface FormState {
  insuranceCompany: string
  documentNumber: string
  issueDate: string
  linkedDocumentId: string
  adjustmentReason: string
  adjustmentSign: AdjustmentSign | ''
  amount: string
  description: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

export default function DocumentoAsientoAjusteForm({ initialDoc }: DocumentoAsientoAjusteFormProps) {
  const isEdit = !!initialDoc
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>({
    insuranceCompany: initialDoc?.insuranceCompany ?? '',
    documentNumber: initialDoc?.documentNumber ?? '',
    issueDate: initialDoc?.issueDate ?? '',
    linkedDocumentId: initialDoc?.linkedDocumentId ?? '',
    adjustmentReason: initialDoc?.adjustmentReason ?? '',
    adjustmentSign: (initialDoc?.adjustmentSign as AdjustmentSign) ?? '',
    amount: initialDoc ? String(initialDoc.netAmount) : '',
    description: initialDoc?.description ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const { savedDocId, isSaved, markUnsaved, markSaved } = useSavedDocState(initialDoc?.id)
  const { dupWarning, dupChecking } = useDuplicateDocumentNumberCheck(form.documentNumber, !isEdit)

  const { data: allDocuments = [] } = useQuery({ queryKey: ['documents'], queryFn: () => documentsApi.findAll() })
  const { data: insuranceCompanies = [] } = useQuery({ queryKey: ['catalogs', 'insurance_company'], queryFn: () => catalogsApi.findByCategory('insurance_company') })
  const { data: documentTypesData } = useQuery({ queryKey: ['documents', 'types'], queryFn: () => documentsApi.getTypes() })
  const adjustmentReasons = documentTypesData?.adjustmentReasons ?? []

  const linkableDocuments = allDocuments.filter(
    (d) => ADJUSTABLE_TYPES.includes(d.documentType) && d.documentStatus !== 'CANCELLED' && (!isEdit || d.id !== initialDoc!.id),
  )
  const linkedDocument = allDocuments.find((d) => d.id === form.linkedDocumentId) ?? null

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    markUnsaved()
  }

  const validate = (): boolean => {
    const next: FormErrors = {}
    if (!form.insuranceCompany) next.insuranceCompany = 'Requerido'
    if (!form.documentNumber.trim()) next.documentNumber = 'Requerido'
    if (!form.issueDate) next.issueDate = 'Requerido'
    if (!form.linkedDocumentId) next.linkedDocumentId = 'El documento a ajustar es requerido'
    if (!form.adjustmentReason) next.adjustmentReason = 'Requerido'
    if (!form.adjustmentSign) next.adjustmentSign = 'Requerido'
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) next.amount = 'Requerido'
    if (!form.description.trim()) next.description = 'Requerido'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const amount = parseFloat(form.amount) || 0

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        documentType: 'ADJUSTMENT_ENTRY',
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        netAmount: amount,
        vatAmount: 0,
        otherTaxesAmount: 0,
        insuranceCompany: form.insuranceCompany,
        description: form.description,
        linkedDocumentId: form.linkedDocumentId,
        adjustmentReason: form.adjustmentReason,
        adjustmentSign: form.adjustmentSign as AdjustmentSign,
        allocations: [],
        installments: [],
      }),
  })

  const updateMutation = useMutation({
    mutationFn: (docId: string) =>
      documentsApi.update(docId, {
        issueDate: form.issueDate,
        netAmount: amount,
        insuranceCompany: form.insuranceCompany,
        description: form.description,
        linkedDocumentId: form.linkedDocumentId,
        adjustmentReason: form.adjustmentReason,
        adjustmentSign: form.adjustmentSign as AdjustmentSign,
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
    queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

  return (
    <PageContent>
      <PageHeader
        title={isEdit ? `Editar ${initialDoc!.documentNumber}` : 'Nuevo Asiento de Ajuste'}
        subtitle="Corrige o netea el saldo de otro documento — uso interno"
        backTo={isEdit ? `/insurance/documents/${initialDoc!.id}` : '/insurance/documents'}
        backLabel={isEdit ? 'Volver al documento' : 'Volver a documentos'}
      />

      <div className="mb-4 max-w-5xl flex items-start gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <span>Este asiento de ajuste es interno. No genera pago ni cuotas. Solo impactará el saldo cuando sea aplicado, desde el detalle del documento.</span>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        <SectionCard title="Identificación" subtitle="Compañía y documento a ajustar">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect value={form.insuranceCompany} onChange={set('insuranceCompany')} required>
                <option value="">Seleccionar compañía…</option>
                {insuranceCompanies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </FormSelect>
            </FormField>

            {isEdit ? (
              <FormField label="N° de Ajuste">
                <FormInput value={form.documentNumber} readOnly disabled className="bg-slate-50 text-slate-500 cursor-not-allowed" />
                <p className="text-xs text-slate-400 mt-1">El número de documento no puede modificarse.</p>
              </FormField>
            ) : (
              <FormField label="N° de Ajuste" required error={errors.documentNumber}>
                <FormInput placeholder="Ej: 0001-00001234-AJ1" value={form.documentNumber} onChange={set('documentNumber')} required />
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

            <FormField label="Documento a Ajustar" required error={errors.linkedDocumentId} fullWidth>
              <DocumentRelationSelector
                documents={linkableDocuments}
                value={form.linkedDocumentId}
                onChange={(id) => { setForm((p) => ({ ...p, linkedDocumentId: id })); markUnsaved() }}
                required
                emptyMessage="No hay documentos disponibles para ajustar."
              />
            </FormField>
          </FormSection>
        </SectionCard>

        <SectionCard title="Detalle del Ajuste" subtitle="Motivo, signo e importe">
          <FormSection title="">
            <FormField label="Motivo del Ajuste" required error={errors.adjustmentReason}>
              <FormSelect value={form.adjustmentReason} onChange={set('adjustmentReason')} required>
                <option value="">Seleccionar motivo…</option>
                {adjustmentReasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </FormSelect>
            </FormField>

            <FormField label="Signo del Ajuste" required error={errors.adjustmentSign}>
              <FormSelect value={form.adjustmentSign} onChange={set('adjustmentSign')} required>
                <option value="">Seleccionar signo…</option>
                <option value="POSITIVE">Positivo (suma al saldo)</option>
                <option value="NEGATIVE">Negativo (resta al saldo)</option>
              </FormSelect>
            </FormField>

            <FormField label="Importe del Ajuste" required error={errors.amount}>
              <FormInput type="number" placeholder="0.00" value={form.amount} onChange={set('amount')} min="0" step="0.01" required />
            </FormField>

            <FormField label="Descripción / Justificación" required error={errors.description} fullWidth>
              <FormTextarea rows={2} value={form.description} onChange={set('description')} placeholder="Justificación del ajuste…" required />
            </FormField>
          </FormSection>

          <div className="mt-4">
            <DocumentImpactPreview
              documentType="ADJUSTMENT_ENTRY"
              linkedDocument={linkedDocument}
              amount={amount}
              currency={linkedDocument?.currency ?? 'ARS'}
              adjustmentSign={form.adjustmentSign}
            />
          </div>
        </SectionCard>

        <DocumentAttachmentsCard isSaved={isSaved} savedDocId={savedDocId} />

        <DocumentFormFooter isSubmitting={isSubmitting} isSaved={isSaved} savedDocId={savedDocId} />
      </form>
    </PageContent>
  )
}
