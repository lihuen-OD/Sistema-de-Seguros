import { useState } from 'react'
import { Plus, Trash2, ListPlus, AlertTriangle } from 'lucide-react'
import { FormSelect, FormInput } from './FormSection'
import { formatCurrencyFull } from '../../utils/format'
import type { Policy, PolicyCoverage, Currency } from '../../types'

export interface PolicyAllocationRow {
  id: string
  policyAssetCoverageId: string
  allocatedAmount: string
}

export function createEmptyPolicyRow(): PolicyAllocationRow {
  return { id: crypto.randomUUID(), policyAssetCoverageId: '', allocatedAmount: '' }
}

interface PolicySelectorSingleProps {
  mode: 'single'
  policies: Policy[]
  value: string
  onChange: (policyId: string) => void
  emptyMessage?: string
}

interface PolicySelectorMultiProps {
  mode: 'multi'
  // Necesita el detalle completo (con `coverages`) de cada póliza elegible —
  // la distribución apunta a una línea (un activo, o "sin activo"), no a la
  // póliza entera, así el reparto es real por activo.
  policies: Policy[]
  rows: PolicyAllocationRow[]
  onRowsChange: (rows: PolicyAllocationRow[]) => void
  currency: Currency
  // Total real del documento (neto + IVA + otros impuestos) — la
  // participación de cada línea se calcula contra ESTE valor, no contra la
  // suma de lo ya asignado, para que una distribución incompleta se vea
  // como incompleta (no como un 100% engañoso).
  documentTotal: number
  emptyMessage?: string
}

type PolicySelectorProps = PolicySelectorSingleProps | PolicySelectorMultiProps

function policyTypeLabel(p: Policy): string {
  return (p.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'
}

function coverageLabel(coverage: PolicyCoverage): string {
  if (!coverage.asset) return 'Sin activo asociado'
  return coverage.asset.fixedAssetCode ? `${coverage.asset.name} (${coverage.asset.fixedAssetCode})` : coverage.asset.name
}

// Selector de pólizas con dos modos: single (Endoso — una póliza obligatoria,
// asociación a nivel póliza) y multi (Factura — varias líneas de cobertura
// con distribución de importe, cada una un activo o "sin activo" concreto).
export function PolicySelector(props: PolicySelectorProps) {
  // Debe llamarse siempre, antes de cualquier return condicional de abajo —
  // las reglas de hooks de React exigen el mismo orden de hooks en cada
  // render, sin importar qué rama (sin pólizas / single / multi) termine
  // renderizando este componente.
  const [policyToAdd, setPolicyToAdd] = useState('')

  if (props.policies.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
        <p className="text-sm text-slate-400">
          {props.emptyMessage ?? 'No hay pólizas activas disponibles.'}
        </p>
      </div>
    )
  }

  if (props.mode === 'single') {
    return (
      <FormSelect value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Seleccionar póliza…</option>
        {props.policies.map((p) => (
          <option key={p.id} value={p.id}>
            {p.policyNumber} — {policyTypeLabel(p)}
          </option>
        ))}
      </FormSelect>
    )
  }

  const { policies, rows, onRowsChange, currency, documentTotal } = props
  const totalAllocated = rows.reduce((s, r) => s + (parseFloat(r.allocatedAmount) || 0), 0)
  const policiesWithCoverages = policies.filter((p) => (p.coverages ?? []).length > 0)
  const remaining = documentTotal - totalAllocated
  const isBalanced = Math.abs(remaining) < 0.01

  const updateRow = (rowId: string, field: 'policyAssetCoverageId' | 'allocatedAmount', value: string) => {
    onRowsChange(rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)))
  }
  const addRow = () => onRowsChange([...rows, createEmptyPolicyRow()])
  const removeRow = (rowId: string) => onRowsChange(rows.filter((r) => r.id !== rowId))

  // El importe es la fuente de verdad; la participación es una vista/entrada
  // alternativa sobre el MISMO valor — editarla despeja el importe a partir
  // del total real del documento, así las dos quedan siempre consistentes.
  const handlePctChange = (rowId: string, value: string) => {
    if (documentTotal <= 0) return
    const pct = parseFloat(value) || 0
    const amount = (pct / 100) * documentTotal
    updateRow(rowId, 'allocatedAmount', amount ? amount.toFixed(2) : '')
  }

  // Trae de una todas las líneas de cobertura de la póliza elegida — evita
  // tener que agregarlas una por una cuando una póliza cubre muchos activos.
  // Es aditivo (no pisa filas ya cargadas) y no duplica líneas ya presentes;
  // sí descarta la fila vacía inicial sin usar, para no dejarla como línea
  // suelta sin sentido.
  const handleAddPolicy = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const policyId = e.target.value
    setPolicyToAdd('')
    const policy = policiesWithCoverages.find((p) => p.id === policyId)
    if (!policy) return

    const existingCoverageIds = new Set(rows.map((r) => r.policyAssetCoverageId).filter(Boolean))
    const newRows = (policy.coverages ?? [])
      .filter((c) => !existingCoverageIds.has(c.id))
      .map((c) => ({ id: crypto.randomUUID(), policyAssetCoverageId: c.id, allocatedAmount: '' }))
    if (newRows.length === 0) return

    const remainingRows = rows.filter((r) => r.policyAssetCoverageId)
    onRowsChange([...remainingRows, ...newRows])
  }

  return (
    <div className="space-y-3">
      {policiesWithCoverages.length > 0 && (
        <div className="flex items-center gap-2.5 p-3 bg-brand-50/60 border border-brand-100 rounded-xl">
          <ListPlus size={15} className="text-brand-500 flex-shrink-0" />
          <FormSelect value={policyToAdd} onChange={handleAddPolicy} className="flex-1 bg-white">
            <option value="">Agregar todos los activos de una póliza…</option>
            {policiesWithCoverages.map((p) => {
              const count = (p.coverages ?? []).length
              return (
                <option key={p.id} value={p.id}>
                  {p.policyNumber} — {policyTypeLabel(p)} ({count} activo{count !== 1 ? 's' : ''})
                </option>
              )
            })}
          </FormSelect>
        </div>
      )}

      <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Póliza / Activo</span>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
          Importe asignado
        </span>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
          Participación
        </span>
        <span />
      </div>

      {rows.map((row) => {
        const allocated = parseFloat(row.allocatedAmount) || 0
        const pct = documentTotal > 0 ? (allocated / documentTotal) * 100 : 0
        const pctValue = allocated === 0 ? '' : String(Math.round(pct * 100) / 100)
        return (
          <div key={row.id} className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center">
            <FormSelect
              value={row.policyAssetCoverageId}
              onChange={(e) => updateRow(row.id, 'policyAssetCoverageId', e.target.value)}
            >
              <option value="">Seleccionar activo…</option>
              {policiesWithCoverages.map((p) => (
                <optgroup key={p.id} label={`${p.policyNumber} — ${policyTypeLabel(p)}`}>
                  {(p.coverages ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {coverageLabel(c)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </FormSelect>

            <FormInput
              type="number"
              placeholder="0.00"
              value={row.allocatedAmount}
              onChange={(e) => updateRow(row.id, 'allocatedAmount', e.target.value)}
              min="0"
              step="0.01"
              className="text-right"
            />

            <div className="relative">
              <FormInput
                type="number"
                placeholder="0,0"
                value={pctValue}
                onChange={(e) => handlePctChange(row.id, e.target.value)}
                disabled={documentTotal <= 0}
                title={documentTotal <= 0 ? 'Completá primero los importes de la factura' : undefined}
                min="0"
                max="100"
                step="0.1"
                className="text-right pr-6"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
            </div>

            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={rows.length === 1}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}

      {rows.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center">
            <span className="text-xs font-semibold text-slate-500 pl-1">Total asignado</span>
            <span className={`text-xs font-bold tabular-nums text-right pr-1 ${isBalanced ? 'text-slate-800' : 'text-red-600'}`}>
              {formatCurrencyFull(totalAllocated, currency)}
            </span>
            <span className={`text-xs font-bold text-right pr-1 ${isBalanced ? 'text-brand-600' : 'text-red-600'}`}>
              {(documentTotal > 0 ? (totalAllocated / documentTotal) * 100 : 0).toFixed(1).replace('.', ',')}%
            </span>
            <span />
          </div>
          {!isBalanced && documentTotal > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-red-600 pl-1">
              <AlertTriangle size={12} className="flex-shrink-0" />
              {remaining > 0
                ? `Falta distribuir ${formatCurrencyFull(remaining, currency)} para llegar al total de la factura.`
                : `El total asignado excede el total de la factura por ${formatCurrencyFull(Math.abs(remaining), currency)}.`}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
      >
        <Plus size={13} />
        Agregar activo
      </button>
    </div>
  )
}
