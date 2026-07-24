import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { FormSection, FormField, FormInput, FormSelect, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { PolicySelector } from '../../../../shared/components/forms/PolicySelector'
import { DocumentRelationSelector } from '../components/DocumentRelationSelector'
import { DocumentImpactPreview } from '../components/DocumentImpactPreview'
import { DocumentFormFooter } from '../components/DocumentFormFooter'
import { DocumentAttachmentsCard } from '../components/DocumentAttachmentsCard'
import { useSavedDocState } from '../hooks/useSavedDocState'
import { useDuplicateDocumentNumberCheck } from '../hooks/useDuplicateDocumentNumberCheck'
import { documentsApi, documentKeys, documentQueries } from '../../../../shared/api/documents.api'
import { policyQueries } from '../../../../shared/api/policies.api'
import { catalogQueries } from '../../../../shared/api/catalogs.api'
import { notifyValidationErrors } from '../../../../shared/utils/formValidation'
import type { AccountingDocument, EconomicImpactType } from '../../../../shared/types'
import { ENDORSEMENT_ALLOWED_LINKED_TYPES } from '../endorsementRules'

interface DocumentoEndosoFormProps {
  initialDoc?: AccountingDocument
}

interface FormState {
  insuranceCompany: string
  documentNumber: string
  issueDate: string
  policyId: string
  endorsementType: string
  endorsementEffectiveDate: string
  description: string
  economicImpactType: EconomicImpactType | ''
  linkedDocumentId: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

export default function DocumentoEndosoForm({ initialDoc }: DocumentoEndosoFormProps) {
  const isEdit = !!initialDoc
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>({
    insuranceCompany: initialDoc?.insuranceCompany ?? '',
    documentNumber: initialDoc?.documentNumber ?? '',
    issueDate: initialDoc?.issueDate ?? '',
    policyId: initialDoc?.policyId ?? '',
    endorsementType: initialDoc?.endorsementType ?? '',
    endorsementEffectiveDate: initialDoc?.endorsementEffectiveDate ?? '',
    description: initialDoc?.description ?? '',
    economicImpactType: (initialDoc?.economicImpactType as EconomicImpactType) ?? '',
    linkedDocumentId: initialDoc?.linkedDocumentId ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const { savedDocId, isSaved, markUnsaved, markSaved } = useSavedDocState(initialDoc?.id)
  const { dupWarning, dupChecking } = useDuplicateDocumentNumberCheck(form.documentNumber, !isEdit, 'ENDORSEMENT', form.insuranceCompany)

  const { data: allPolicies = [] } = useQuery(policyQueries.list())
  const { data: allDocuments = [] } = useQuery(documentQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))
  const { data: documentTypesData } = useQuery(documentQueries.types())
  const endorsementTypes = documentTypesData?.endorsementTypes ?? []
  const economicImpactTypes = documentTypesData?.economicImpactTypes ?? []

  const availablePolicies = isEdit
    ? allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany)
    : allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany && (p.status === 'vigente' || p.status === 'proximo_vencer'))

  const allowedLinkedTypes = form.economicImpactType ? ENDORSEMENT_ALLOWED_LINKED_TYPES[form.economicImpactType] : undefined
  const linkableDocuments = allowedLinkedTypes
    ? allDocuments.filter((d) => allowedLinkedTypes.includes(d.documentType) && d.documentStatus !== 'CANCELLED')
    : []
  const linkedDocument = allDocuments.find((d) => d.id === form.linkedDocumentId) ?? null

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    markUnsaved()
  }

  const handleEconomicImpactChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, economicImpactType: e.target.value as EconomicImpactType, linkedDocumentId: '' }))
    markUnsaved()
  }

  const validate = (): boolean => {
    const next: FormErrors = {}
    if (!form.insuranceCompany) next.insuranceCompany = 'Requerido'
    if (!form.documentNumber.trim()) next.documentNumber = 'Requerido'
    if (!form.issueDate) next.issueDate = 'Requerido'
    if (!form.policyId) next.policyId = 'La póliza asociada es requerida'
    if (!form.endorsementType) next.endorsementType = 'Requerido'
    if (!form.endorsementEffectiveDate) next.endorsementEffectiveDate = 'Requerido'
    if (!form.description.trim()) next.description = 'Requerido'
    if (!form.economicImpactType) next.economicImpactType = 'Requerido'
    setErrors(next)
    notifyValidationErrors(next)
    return Object.keys(next).length === 0
  }

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        documentType: 'ENDORSEMENT',
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        netAmount: 0,
        vatAmount: 0,
        otherTaxesAmount: 0,
        insuranceCompany: form.insuranceCompany,
        description: form.description,
        policyId: form.policyId,
        endorsementType: form.endorsementType,
        endorsementEffectiveDate: form.endorsementEffectiveDate,
        economicImpactType: form.economicImpactType as EconomicImpactType,
        linkedDocumentId: form.linkedDocumentId || undefined,
        allocations: [],
        installments: [],
      }),
  })

  const updateMutation = useMutation({
    mutationFn: (docId: string) =>
      documentsApi.update(docId, {
        issueDate: form.issueDate,
        insuranceCompany: form.insuranceCompany,
        description: form.description,
        policyId: form.policyId,
        endorsementType: form.endorsementType,
        endorsementEffectiveDate: form.endorsementEffectiveDate,
        economicImpactType: form.economicImpactType as EconomicImpactType,
        linkedDocumentId: form.linkedDocumentId || undefined,
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
        title={isEdit ? `Editar ${initialDoc!.documentNumber}` : 'Nuevo Endoso'}
        subtitle="Modifica una póliza — no mueve saldo por sí mismo"
        backTo={isEdit ? `/insurance/documents/${initialDoc!.id}` : '/insurance/documents'}
        backLabel={isEdit ? 'Volver al documento' : 'Volver a documentos'}
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        <SectionCard title="Identificación" subtitle="Compañía, póliza y datos del endoso">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect
                value={form.insuranceCompany}
                onChange={(e) => { setForm((p) => ({ ...p, insuranceCompany: e.target.value, policyId: isEdit ? p.policyId : '' })); markUnsaved() }}
                required
              >
                <option value="">Seleccionar compañía…</option>
                {insuranceCompanies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </FormSelect>
            </FormField>

            {isEdit ? (
              <FormField label="N° de Endoso / Documento">
                <FormInput value={form.documentNumber} readOnly disabled className="bg-slate-50 text-slate-500 cursor-not-allowed" />
                <p className="text-xs text-slate-400 mt-1">El número de documento no puede modificarse.</p>
              </FormField>
            ) : (
              <FormField label="N° de Endoso / Documento" required error={errors.documentNumber}>
                <FormInput placeholder="Ej: END-2026-000001" value={form.documentNumber} onChange={set('documentNumber')} required />
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

            <FormField label="Fecha de Vigencia del Endoso" required error={errors.endorsementEffectiveDate}>
              <FormInput type="date" value={form.endorsementEffectiveDate} onChange={set('endorsementEffectiveDate')} required />
            </FormField>

            <FormField label="Póliza Asociada" required error={errors.policyId} fullWidth>
              <PolicySelector
                mode="single"
                policies={availablePolicies}
                value={form.policyId}
                onChange={(id) => { setForm((p) => ({ ...p, policyId: id })); markUnsaved() }}
                emptyMessage={!form.insuranceCompany ? 'Seleccioná primero la compañía aseguradora.' : `No hay pólizas activas para ${form.insuranceCompany}.`}
              />
            </FormField>

            <FormField label="Tipo de Endoso" required error={errors.endorsementType}>
              <FormSelect value={form.endorsementType} onChange={set('endorsementType')} required>
                <option value="">Seleccionar tipo…</option>
                {endorsementTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </FormSelect>
            </FormField>

            <FormField label="Descripción / Motivo" required error={errors.description} fullWidth>
              <FormTextarea rows={2} value={form.description} onChange={set('description')} placeholder="Detalle del endoso…" required />
            </FormField>
          </FormSection>
        </SectionCard>

        <SectionCard title="Impacto Económico" subtitle="Si corresponde, respaldalo con un documento contable">
          <FormSection title="">
            <FormField label="Impacto Económico" required error={errors.economicImpactType} fullWidth>
              <FormSelect value={form.economicImpactType} onChange={handleEconomicImpactChange} required>
                <option value="">Seleccionar impacto…</option>
                {economicImpactTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </FormSelect>
            </FormField>

            {(form.economicImpactType === 'INCREASES_COST' || form.economicImpactType === 'DECREASES_COST') && (
              <FormField
                label={form.economicImpactType === 'INCREASES_COST' ? 'Vincular Factura o Nota de Débito' : 'Vincular Nota de Crédito'}
                fullWidth
              >
                <DocumentRelationSelector
                  documents={linkableDocuments}
                  value={form.linkedDocumentId}
                  onChange={(id) => { setForm((p) => ({ ...p, linkedDocumentId: id })); markUnsaved() }}
                  emptyMessage="No hay documentos disponibles para vincular todavía — podés dejarlo pendiente."
                  helperText="Podés dejarlo sin vincular y cargarlo después."
                />
              </FormField>
            )}
          </FormSection>

          <div className="mt-4">
            <DocumentImpactPreview
              documentType="ENDORSEMENT"
              linkedDocument={linkedDocument}
              amount={0}
              currency="ARS"
              economicImpactType={form.economicImpactType}
            />
          </div>
        </SectionCard>

        <DocumentAttachmentsCard isSaved={isSaved} savedDocId={savedDocId} />

        <DocumentFormFooter isSubmitting={isSubmitting} isSaved={isSaved} savedDocId={savedDocId} />
      </form>
    </PageContent>
  )
}
