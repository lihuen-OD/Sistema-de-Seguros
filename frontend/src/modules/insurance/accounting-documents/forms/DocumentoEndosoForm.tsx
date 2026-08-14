import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Info } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../../shared/components/cards/SectionCard'
import { FormSection, FormField, FormInput, FormSelect, FormTextarea } from '../../../../shared/components/forms/FormSection'
import { PolicySelector, createEmptyPolicyRow, type PolicyAllocationRow } from '../../../../shared/components/forms/PolicySelector'
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
import { calculateAllocationPercentage } from '../../../../shared/utils/allocationPercentage'
import { formatCurrencyFull } from '../../../../shared/utils/format'
import { CURRENCY_OPTIONS } from '../../../../shared/constants'
import type { AccountingDocument, Currency, EconomicImpactType } from '../../../../shared/types'

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
  currency: Currency | ''
  exchangeRate: string
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
}

type FormErrors = Partial<Record<keyof FormState | 'policies', string>>

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
    currency: initialDoc?.currency ?? '',
    exchangeRate: initialDoc ? String(initialDoc.exchangeRate) : '',
    netAmount: initialDoc ? String(initialDoc.netAmount) : '',
    vatAmount: initialDoc ? String(initialDoc.vatAmount) : '0',
    otherTaxesAmount: initialDoc ? String(initialDoc.otherTaxesAmount) : '0',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [policyRows, setPolicyRows] = useState<PolicyAllocationRow[]>([createEmptyPolicyRow()])
  const [allocationsInitialized, setAllocationsInitialized] = useState(!isEdit)

  const { savedDocId, isSaved, markUnsaved, markSaved } = useSavedDocState(initialDoc?.id)
  const { dupWarning, dupChecking } = useDuplicateDocumentNumberCheck(form.documentNumber, true, 'ENDORSEMENT', form.insuranceCompany, initialDoc?.id)

  const { data: allPolicies = [] } = useQuery(policyQueries.list())
  const { data: allDocuments = [] } = useQuery(documentQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))
  const { data: documentTypesData } = useQuery(documentQueries.types())
  const endorsementTypes = documentTypesData?.endorsementTypes ?? []
  const economicImpactTypes = documentTypesData?.economicImpactTypes ?? []

  const availablePolicies = isEdit
    ? allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany)
    : allPolicies.filter((p) => p.insuranceCompany === form.insuranceCompany && (p.status === 'vigente' || p.status === 'proximo_vencer'))

  const hasEconomicImpact = form.economicImpactType === 'INCREASES_COST' || form.economicImpactType === 'DECREASES_COST'

  // La factura a vincular tiene que ser de la MISMA póliza que este Endoso
  // modifica — el backend ya lo exige (ver documents.service.ts), esto solo
  // evita ofrecer en el selector opciones que de todos modos van a rechazarse.
  const linkableDocuments = form.policyId
    ? allDocuments.filter(
        (d) => d.documentType === 'INVOICE' && d.documentStatus !== 'CANCELLED' && d.policyIds.includes(form.policyId),
      )
    : []
  const linkedDocument = allDocuments.find((d) => d.id === form.linkedDocumentId) ?? null

  // El detalle completo (con `coverages`) de la única póliza que este Endoso
  // modifica — a diferencia de Factura, acá no hace falta el hook multi-póliza
  // porque el policyId ya es fijo.
  const { data: policyDetail } = useQuery({ ...policyQueries.detail(form.policyId), enabled: !!form.policyId })
  const distributionPolicies = policyDetail ? [policyDetail] : []

  const { data: existingAllocations = [], isSuccess: allocationsLoaded } = useQuery({
    ...documentQueries.allocations(initialDoc?.id ?? ''),
    enabled: isEdit,
  })
  if (allocationsLoaded && !allocationsInitialized) {
    setAllocationsInitialized(true)
    if (existingAllocations.length > 0) {
      setPolicyRows(existingAllocations.map((a) => ({
        id: crypto.randomUUID(),
        policyAssetCoverageId: a.policyAssetCoverageId,
        allocatedAmount: String(a.allocatedAmount),
      })))
    }
  }

  const parsedNet = parseFloat(form.netAmount) || 0
  const parsedVat = parseFloat(form.vatAmount) || 0
  const parsedOther = parseFloat(form.otherTaxesAmount) || 0
  const computedTotal = hasEconomicImpact ? parsedNet + parsedVat + parsedOther : 0
  const tc = parseFloat(form.exchangeRate) || 0
  const equivalentCurrency: Currency = form.currency === 'ARS' ? 'USD' : 'ARS'
  const equivalentAmount =
    form.currency === 'ARS' && tc > 0 ? computedTotal / tc : form.currency === 'USD' && tc > 0 ? computedTotal * tc : 0

  const totalAllocated = policyRows.reduce((s, r) => s + (parseFloat(r.allocatedAmount) || 0), 0)
  const allocationTotalMismatch = policyRows.some((r) => r.policyAssetCoverageId) && Math.abs(computedTotal - totalAllocated) > 0.01

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    markUnsaved()
  }

  const handleEconomicImpactChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextImpact = e.target.value as EconomicImpactType
    const nextHasImpact = nextImpact === 'INCREASES_COST' || nextImpact === 'DECREASES_COST'
    setForm((prev) => ({
      ...prev,
      economicImpactType: nextImpact,
      linkedDocumentId: '',
      currency: nextHasImpact ? prev.currency : '',
      exchangeRate: nextHasImpact ? prev.exchangeRate : '',
      netAmount: nextHasImpact ? prev.netAmount : '0',
      vatAmount: nextHasImpact ? prev.vatAmount : '0',
      otherTaxesAmount: nextHasImpact ? prev.otherTaxesAmount : '0',
    }))
    if (!nextHasImpact) setPolicyRows([createEmptyPolicyRow()])
    markUnsaved()
  }

  const handleLinkedDocumentChange = (id: string) => {
    const linked = allDocuments.find((d) => d.id === id)
    setForm((prev) => ({
      ...prev,
      linkedDocumentId: id,
      currency: linked?.currency ?? prev.currency,
      exchangeRate: linked ? String(linked.exchangeRate) : prev.exchangeRate,
    }))
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
    if (hasEconomicImpact) {
      if (!form.linkedDocumentId) next.linkedDocumentId = 'La factura asociada es requerida'
      else if (!linkedDocument?.paymentMethod) next.linkedDocumentId = 'La factura asociada no tiene forma de pago'
      if (!form.netAmount || isNaN(parsedNet) || parsedNet <= 0) next.netAmount = 'Requerido'
      if (policyRows.length === 0 || policyRows.every((r) => !r.policyAssetCoverageId)) {
        next.policies = 'Distribuí el importe entre al menos un activo'
      } else if (allocationTotalMismatch) {
        next.policies = `El total asignado (${formatCurrencyFull(totalAllocated, form.currency)}) debe coincidir con el importe del Endoso (${formatCurrencyFull(computedTotal, form.currency)}).`
      }
    }
    setErrors(next)
    notifyValidationErrors(next)
    return Object.keys(next).length === 0
  }

  const allocationsInput = hasEconomicImpact
    ? policyRows
        .filter((r) => r.policyAssetCoverageId && parseFloat(r.allocatedAmount) > 0)
        .map((r) => ({
          policyAssetCoverageId: r.policyAssetCoverageId,
          allocatedAmount: parseFloat(r.allocatedAmount),
          allocationPercentage: calculateAllocationPercentage(parseFloat(r.allocatedAmount), computedTotal),
        }))
    : []

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        documentType: 'ENDORSEMENT',
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        currency: hasEconomicImpact ? form.currency : undefined,
        exchangeRate: hasEconomicImpact ? tc : undefined,
        netAmount: hasEconomicImpact ? parsedNet : 0,
        vatAmount: hasEconomicImpact ? parsedVat : 0,
        otherTaxesAmount: hasEconomicImpact ? parsedOther : 0,
        insuranceCompany: form.insuranceCompany,
        description: form.description,
        policyId: form.policyId,
        endorsementType: form.endorsementType,
        endorsementEffectiveDate: form.endorsementEffectiveDate,
        economicImpactType: form.economicImpactType as EconomicImpactType,
        linkedDocumentId: form.linkedDocumentId || undefined,
        allocations: allocationsInput,
        installments: [],
      }),
  })

  const updateMutation = useMutation({
    mutationFn: async (docId: string) => {
      await documentsApi.update(docId, {
        documentNumber: form.documentNumber.trim(),
        issueDate: form.issueDate,
        currency: hasEconomicImpact ? form.currency : undefined,
        exchangeRate: hasEconomicImpact ? tc : undefined,
        netAmount: hasEconomicImpact ? parsedNet : 0,
        vatAmount: hasEconomicImpact ? parsedVat : 0,
        otherTaxesAmount: hasEconomicImpact ? parsedOther : 0,
        insuranceCompany: form.insuranceCompany,
        description: form.description,
        policyId: form.policyId,
        endorsementType: form.endorsementType,
        endorsementEffectiveDate: form.endorsementEffectiveDate,
        economicImpactType: form.economicImpactType as EconomicImpactType,
        linkedDocumentId: form.linkedDocumentId || undefined,
      })
      await documentsApi.replaceAllocations(docId, allocationsInput)
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
        title={isEdit ? `Editar ${initialDoc!.documentNumber}` : 'Nuevo Endoso'}
        subtitle="Modifica una póliza — puede aumentar o reducir el costo de una factura asociada"
        backTo={isEdit ? `/insurance/documents/${initialDoc!.id}` : '/insurance/documents'}
        backLabel={isEdit ? 'Volver al documento' : 'Volver a documentos'}
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        <SectionCard title="Identificación" subtitle="Compañía, póliza y datos del endoso">
          <FormSection title="">
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect
                value={form.insuranceCompany}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    insuranceCompany: e.target.value,
                    policyId: isEdit ? p.policyId : '',
                    linkedDocumentId: isEdit ? p.linkedDocumentId : '',
                  }))
                  if (!isEdit) setPolicyRows([createEmptyPolicyRow()])
                  markUnsaved()
                }}
                required
              >
                <option value="">Seleccionar compañía…</option>
                {insuranceCompanies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </FormSelect>
            </FormField>

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
                onChange={(id) => { setForm((p) => ({ ...p, policyId: id, linkedDocumentId: '' })); setPolicyRows([createEmptyPolicyRow()]); markUnsaved() }}
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

        <SectionCard title="Impacto Económico" subtitle="Si corresponde, respaldalo con la factura de la misma póliza">
          <FormSection title="">
            <FormField label="Impacto Económico" required error={errors.economicImpactType} fullWidth>
              <FormSelect value={form.economicImpactType} onChange={handleEconomicImpactChange} required>
                <option value="">Seleccionar impacto…</option>
                {economicImpactTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </FormSelect>
            </FormField>

            {hasEconomicImpact && (
              <FormField label="Factura Asociada" required error={errors.linkedDocumentId} fullWidth>
                <DocumentRelationSelector
                  documents={linkableDocuments}
                  value={form.linkedDocumentId}
                  onChange={handleLinkedDocumentChange}
                  required
                  emptyMessage={!form.policyId ? 'Seleccioná primero la póliza asociada.' : 'No hay facturas de esta póliza disponibles para vincular.'}
                  helperText="Solo se listan facturas de la póliza elegida arriba."
                />
              </FormField>
            )}

            {form.linkedDocumentId && (
              <FormField label="Forma de Pago">
                <FormInput
                  value={linkedDocument?.paymentMethod ?? 'Sin especificar'}
                  readOnly
                  disabled
                  className="bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Se hereda de la factura asociada.
                </p>
              </FormField>
            )}
          </FormSection>

          {!hasEconomicImpact && (
            <div className="mt-4">
              <DocumentImpactPreview
                documentType="ENDORSEMENT"
                linkedDocument={linkedDocument}
                amount={0}
                currency="ARS"
                economicImpactType={form.economicImpactType}
              />
            </div>
          )}
        </SectionCard>

        {hasEconomicImpact && (
          <>
            <SectionCard title="Importes" subtitle="Moneda, tipo de cambio e importe del endoso">
              <FormSection title="">
                <FormField label="Moneda" required error={errors.currency}>
                  <FormSelect value={form.currency} onChange={set('currency')} required disabled={!!form.linkedDocumentId}>
                    <option value="">Seleccionar moneda…</option>
                    {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </FormSelect>
                  {form.linkedDocumentId && (
                    <p className="text-xs text-slate-400 mt-1">Se toma automáticamente de la factura asociada.</p>
                  )}
                </FormField>
                <FormField label="Tipo de Cambio" required error={errors.exchangeRate}>
                  <FormInput
                    type="number"
                    placeholder="Ej: 1150"
                    value={form.exchangeRate}
                    onChange={set('exchangeRate')}
                    min="0.01"
                    step="0.01"
                    required
                    readOnly={!!form.linkedDocumentId}
                    disabled={!!form.linkedDocumentId}
                    className={form.linkedDocumentId ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : undefined}
                  />
                  {form.linkedDocumentId && (
                    <p className="text-xs text-slate-400 mt-1">Se toma automáticamente de la factura asociada.</p>
                  )}
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
                      {formatCurrencyFull(computedTotal, form.currency)}
                    </span>
                  </div>
                  {tc > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-brand-50 rounded-xl border border-brand-100">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 uppercase tracking-wider">
                        <ArrowLeftRight size={12} /> Equivalente
                      </span>
                      <span className="text-base font-bold text-brand-700 tabular-nums">
                        {formatCurrencyFull(equivalentAmount, equivalentCurrency)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                <DocumentImpactPreview
                  documentType="ENDORSEMENT"
                  linkedDocument={linkedDocument}
                  amount={computedTotal}
                  currency={form.currency || 'ARS'}
                  economicImpactType={form.economicImpactType}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Distribución por Activo"
              subtitle="Elegí a qué activo(s) de la póliza se le asigna este importe"
            >
              {errors.policies && <p className="text-xs text-red-500 mb-3">{errors.policies}</p>}
              <PolicySelector
                mode="multi"
                policies={distributionPolicies}
                rows={policyRows}
                onRowsChange={(rows) => { setPolicyRows(rows); markUnsaved() }}
                currency={form.currency || 'ARS'}
                documentTotal={computedTotal}
                emptyMessage="Seleccioná primero la póliza asociada."
              />
            </SectionCard>
          </>
        )}

        <DocumentAttachmentsCard isSaved={isSaved} savedDocId={savedDocId} />

        <DocumentFormFooter isSubmitting={isSubmitting} isSaved={isSaved} savedDocId={savedDocId} />
      </form>
    </PageContent>
  )
}
