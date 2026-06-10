import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, X, Plus, Trash2, Calculator } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import {
  FormSection,
  FormField,
  FormInput,
  FormSelect,
} from '../../../shared/components/forms/FormSection'
import { FileDropzone } from '../../../shared/components/file-upload/FileDropzone'
import { policyRepository } from '../../../services/repositories/policy.repository'
import { DOCUMENT_TYPE_LABELS } from '../../../shared/constants'
import type { Currency, DocumentType } from '../../../shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyRow {
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
  documentType: DocumentType | ''
  documentNumber: string
  issueDate: string
  currency: Currency | ''
  exchangeRate: string
  netAmount: string
  vatAmount: string
  otherTaxesAmount: string
}

type FormErrors = Partial<Record<keyof DocumentForm | 'policies' | 'installments', string>>

const INITIAL_FORM: DocumentForm = {
  documentType: '',
  documentNumber: '',
  issueDate: '',
  currency: '',
  exchangeRate: '',
  netAmount: '',
  vatAmount: '',
  otherTaxesAmount: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentNewPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<DocumentForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [policyRows, setPolicyRows] = useState<PolicyRow[]>([
    { id: crypto.randomUUID(), policyId: '', allocatedAmount: '' },
  ])
  const [installmentCount, setInstallmentCount] = useState<number>(1)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRow[]>([
    { installmentNumber: 1, dueDate: '', amount: '' },
  ])

  const allPolicies = policyRepository.findAll()

  // ─── Derived: totals ────────────────────────────────────────────────────────

  const parsedNet = parseFloat(form.netAmount) || 0
  const parsedVat = parseFloat(form.vatAmount) || 0
  const parsedOther = parseFloat(form.otherTaxesAmount) || 0
  const computedTotal = parsedNet + parsedVat + parsedOther

  const totalAllocated = useMemo(
    () => policyRows.reduce((s, r) => s + (parseFloat(r.allocatedAmount) || 0), 0),
    [policyRows],
  )

  // ─── Form field setter ───────────────────────────────────────────────────────

  const set =
    (key: keyof DocumentForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

  // ─── Policy rows ─────────────────────────────────────────────────────────────

  const addPolicyRow = () => {
    setPolicyRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), policyId: '', allocatedAmount: '' },
    ])
  }

  const removePolicyRow = (rowId: string) => {
    setPolicyRows((prev) => prev.filter((r) => r.id !== rowId))
  }

  const updatePolicyRow = (rowId: string, field: 'policyId' | 'allocatedAmount', value: string) => {
    setPolicyRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
    )
  }

  // ─── Installment rows ────────────────────────────────────────────────────────

  const rebuildInstallments = useCallback(
    (count: number, total: number) => {
      const perInstallment = count > 0 && total > 0 ? total / count : 0
      const rows: InstallmentRow[] = Array.from({ length: count }, (_, i) => ({
        installmentNumber: i + 1,
        dueDate: installmentRows[i]?.dueDate ?? '',
        amount: perInstallment > 0 ? perInstallment.toFixed(2) : '',
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

  const handleAutoDistribute = () => {
    rebuildInstallments(installmentCount, computedTotal)
  }

  const updateInstallmentRow = (
    idx: number,
    field: 'dueDate' | 'amount',
    value: string,
  ) => {
    setInstallmentRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    )
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const next: FormErrors = {}
    if (!form.documentType) next.documentType = 'Requerido'
    if (!form.documentNumber.trim()) next.documentNumber = 'Requerido'
    if (!form.issueDate) next.issueDate = 'Requerido'
    if (!form.currency) next.currency = 'Requerido'
    if (form.currency === 'USD' && !form.exchangeRate) next.exchangeRate = 'Requerido para USD'
    if (!form.netAmount || isNaN(parseFloat(form.netAmount))) next.netAmount = 'Requerido'
    if (!form.vatAmount || isNaN(parseFloat(form.vatAmount))) next.vatAmount = 'Requerido'
    if (!form.otherTaxesAmount || isNaN(parseFloat(form.otherTaxesAmount)))
      next.otherTaxesAmount = 'Requerido'
    if (policyRows.length === 0 || policyRows.every((r) => !r.policyId))
      next.policies = 'Asociá al menos una póliza'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    alert(
      'Documento guardado exitosamente (simulación). En producción se conectará al backend.',
    )
    navigate('/insurance/documents')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Documento Contable"
        subtitle="Registrá una factura, endoso, nota de crédito o refacturación"
        backTo="/insurance/documents"
        backLabel="Volver a documentos"
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">

        {/* Section 1: Tipo y Número */}
        <SectionCard
          title="Tipo y Número"
          subtitle="Identificación del documento contable"
        >
          <FormSection title="">
            <FormField label="Tipo de Documento" required error={errors.documentType}>
              <FormSelect
                value={form.documentType}
                onChange={set('documentType')}
                required
              >
                <option value="">Seleccionar tipo…</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
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
          </FormSection>
        </SectionCard>

        {/* Section 2: Importes */}
        <SectionCard
          title="Importes"
          subtitle="Moneda, tipo de cambio y desglose de importes"
        >
          <FormSection title="">
            <FormField label="Moneda" required error={errors.currency}>
              <FormSelect value={form.currency} onChange={set('currency')} required>
                <option value="">Seleccionar moneda…</option>
                <option value="ARS">ARS — Pesos Argentinos</option>
                <option value="USD">USD — Dólares</option>
              </FormSelect>
            </FormField>
            {form.currency === 'USD' && (
              <FormField label="Tipo de Cambio (ARS/USD)" required error={errors.exchangeRate}>
                <FormInput
                  type="number"
                  placeholder="Ej: 970"
                  value={form.exchangeRate}
                  onChange={set('exchangeRate')}
                  min="0"
                  step="0.01"
                  required
                />
              </FormField>
            )}
            <FormField label="Neto" required error={errors.netAmount}>
              <FormInput
                type="number"
                placeholder="Ej: 850000"
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
                placeholder="Ej: 178500"
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
                placeholder="Ej: 42500"
                value={form.otherTaxesAmount}
                onChange={set('otherTaxesAmount')}
                min="0"
                step="0.01"
                required
              />
            </FormField>
            <FormField label="Total (calculado automáticamente)">
              <FormInput
                value={
                  computedTotal > 0
                    ? `${form.currency === 'USD' ? 'US$' : 'AR$'} ${computedTotal.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : ''
                }
                readOnly
                disabled
                placeholder="Total = Neto + IVA + Otros"
              />
            </FormField>
          </FormSection>
          {computedTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Calculator size={12} className="text-slate-400" />
                <span>
                  <strong className="text-slate-700">Total</strong> = Neto + IVA + Otros Impuestos
                </span>
              </p>
            </div>
          )}
        </SectionCard>

        {/* Section 3: Pólizas Asociadas */}
        <SectionCard
          title="Pólizas Asociadas"
          subtitle="Asociá el documento a una o varias pólizas e indicá el importe por póliza"
          actions={
            <button
              type="button"
              onClick={addPolicyRow}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus size={13} />
              Agregar póliza
            </button>
          }
        >
          {errors.policies && (
            <p className="text-xs text-red-500 mb-3">{errors.policies}</p>
          )}

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
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center"
                >
                  <FormSelect
                    value={row.policyId}
                    onChange={(e) => updatePolicyRow(row.id, 'policyId', e.target.value)}
                  >
                    <option value="">Seleccionar póliza…</option>
                    {allPolicies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.policyNumber} — {p.insuranceCompany}
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
              )
            })}

            {/* Total allocated row */}
            {policyRows.length > 1 && (
              <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-500 pl-1">
                  Total asignado a pólizas
                </span>
                <span className="text-xs font-bold text-slate-800 tabular-nums text-right pr-1">
                  {form.currency === 'USD' ? 'US$' : 'AR$'}{' '}
                  {totalAllocated.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs font-bold text-blue-600 text-right pr-1">100%</span>
                <span />
              </div>
            )}
          </div>
        </SectionCard>

        {/* Section 4: Cuotas */}
        <SectionCard
          title="Cuotas"
          subtitle="Definí la cantidad de cuotas y asigná fecha y monto a cada una"
        >
          <div className="flex items-end gap-4 mb-5 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">
                Cantidad de cuotas
              </label>
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
                {form.currency === 'USD' ? 'US$' : 'AR$'}{' '}
                {(computedTotal / installmentCount).toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                por cuota
              </p>
            )}
          </div>

          {/* Installment grid */}
          <div className="space-y-2">
            <div className="grid grid-cols-[40px_1fr_1fr] gap-3 px-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                N°
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Fecha de vencimiento
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                Importe
              </span>
            </div>

            {installmentRows.map((row, idx) => (
              <div
                key={row.installmentNumber}
                className="grid grid-cols-[40px_1fr_1fr] gap-3 items-center"
              >
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

        {/* Section 5: Documentación */}
        <SectionCard
          title="Documentación Adjunta"
          subtitle="Adjuntá el PDF del documento y cualquier archivo relacionado"
        >
          <FileDropzone
            label="Factura, endoso o documentos relacionados (PDF, imágenes)"
            accept=".pdf,.jpg,.jpeg,.png"
            maxFiles={5}
          />
        </SectionCard>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 pb-6">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save size={16} />
            Guardar Documento
          </button>
          <button
            type="button"
            onClick={() => navigate('/insurance/documents')}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
          >
            <X size={16} />
            Cancelar
          </button>
        </div>
      </form>
    </PageContent>
  )
}
