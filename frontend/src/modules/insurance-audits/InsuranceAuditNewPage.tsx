import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { Package, X, Loader2, Save, IdCard } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { FormField, FormTextarea } from '../../shared/components/forms/FormSection'
import { ChoiceGroup } from '../../shared/components/forms/ChoiceGroup'
import { FileDropzone } from '../../shared/components/file-upload/FileDropzone'
import { FileViewDownloadButtons } from '../../shared/components/file-viewer/FileViewDownloadButtons'
import {
  insuranceAuditsApi,
  insuranceAuditKeys,
  insuranceAuditQueries,
  type InsuranceAuditCoverageItem,
  type InsuranceAuditAttachment,
  type CirculationCardReference,
} from '../../shared/api/insurance-audits.api'
import { ROUTES } from '../../app/routes'

const CIRCULATION_CARD_OPTIONS = [
  { value: 'yes', label: 'Tiene la tarjeta a bordo' },
  { value: 'no', label: 'No tiene la tarjeta a bordo' },
]

// Stub liviano de activo — es todo lo que esta pantalla necesita mostrar
// (nombre, tipo, código, patente). Se resuelve siempre a partir de la
// cobertura de Auditoría de Seguros, ya scopeada al alcance del usuario, en
// vez de la lista/detalle maestro de Activos (que requiere el módulo
// `assets`, que un auditor con solo el permiso de cobertura no tiene por qué
// tener).
interface AssetStub {
  id: string
  name: string
  assetType: string
  code: string | null
  plate: string | null
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

function AssetPicker({
  selected,
  onSelect,
  coverage,
  isLoading,
}: {
  selected: AssetStub | null
  onSelect: (item: InsuranceAuditCoverageItem) => void
  coverage: InsuranceAuditCoverageItem[]
  isLoading: boolean
}) {
  const [search, setSearch] = useState('')
  const auditable = coverage.filter((a) => !a.audited || a.auditStatus === 'NEEDS_CORRECTION' || a.auditStatus === 'REJECTED')

  const q = search.trim().toLowerCase()
  const filtered = q
    ? auditable.filter((a) =>
        [a.code, a.name, a.assetType, a.plate, a.chassisNumber, a.engineNumber].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
      )
    : auditable

  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">Seleccioná el vehículo o maquinaria que vas a auditar.</p>
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código, nombre, tipo, patente, chasis o motor…" className="mb-4" />

      {isLoading ? (
        <p className="text-sm text-slate-400 py-10 text-center">Cargando activos…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">No se encontraron activos habilitados para auditoría.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((a) => {
            const isActive = selected?.id === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className={clsx(
                  'text-left border rounded-lg p-4 transition-all',
                  isActive ? 'border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Package size={14} className="text-brand-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {a.assetType} · {a.code ?? '—'}
                      {a.plate ? ` · ${a.plate}` : ''}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CirculationCardReferenceCard({ card, assetId }: { card: CirculationCardReference | null; assetId: string }) {
  return (
    <SectionCard title="Tarjeta de circulación en el sistema" className="mb-5">
      {card ? (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <IdCard size={16} className="text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 truncate">{card.name}</p>
            <p className="text-xs text-slate-500">Compará esta imagen contra la tarjeta física que debería estar en el vehículo.</p>
          </div>
          <FileViewDownloadButtons fetchUrl={`/insurance-audits/assets/${assetId}/circulation-card`} name={card.name} />
        </div>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5">
          No hay tarjeta de circulación cargada en el sistema para este activo.
        </p>
      )}
    </SectionCard>
  )
}

export default function InsuranceAuditNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('assetId')

  const { id: editId } = useParams<{ id?: string }>()
  const isEditing = Boolean(editId)

  const [selectedAsset, setSelectedAsset] = useState<AssetStub | null>(null)
  const [referenceCard, setReferenceCard] = useState<CirculationCardReference | null>(null)
  const [seeded, setSeeded] = useState(false)

  const { data: coverage = [], isLoading: coverageLoading } = useQuery(insuranceAuditQueries.coverage(currentPeriod()))

  function handleSelectFromCoverage(item: InsuranceAuditCoverageItem) {
    setSelectedAsset({ id: item.id, name: item.name, assetType: item.assetType, code: item.code, plate: item.plate })
    setReferenceCard(item.referenceCirculationCard)
  }

  // Preselección desde la pestaña "Cobertura" (?assetId=) — se resuelve
  // buscando dentro de la misma lista ya scopeada, sin una consulta aparte.
  useEffect(() => {
    if (!preselectedId || selectedAsset) return
    const match = coverage.find((c) => c.id === preselectedId)
    if (match) handleSelectFromCoverage(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedId, coverage, selectedAsset])

  const { data: editingAudit } = useQuery(insuranceAuditQueries.detail(editId ?? ''))

  const [hasCirculationCard, setHasCirculationCard] = useState<boolean | null>(null)
  const [comments, setComments] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [existingPhotos, setExistingPhotos] = useState<InsuranceAuditAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEditing || seeded || !editingAudit) return
    if (editingAudit.status !== 'SUBMITTED') {
      toast.error('Esta auditoría ya no se puede editar porque ya fue revisada')
      navigate(ROUTES.INSURANCE_AUDITS_DETAIL(editingAudit.id), { replace: true })
      return
    }
    if (editingAudit.asset) {
      setSelectedAsset({
        id: editingAudit.asset.id,
        name: editingAudit.asset.name,
        assetType: editingAudit.asset.assetType,
        code: editingAudit.asset.code,
        plate: editingAudit.asset.plate,
      })
    }
    setReferenceCard(editingAudit.referenceCirculationCard)
    setHasCirculationCard(editingAudit.checklist.hasCirculationCard)
    setComments(editingAudit.checklist.comments ?? '')
    setExistingPhotos(editingAudit.attachments.filter((a) => a.fileType === 'image'))
    setSeeded(true)
  }, [isEditing, seeded, editingAudit, navigate])

  async function handleRemoveExistingPhoto(attachmentId: string) {
    if (!editId) return
    try {
      await insuranceAuditsApi.deleteAttachment(editId, attachmentId)
      setExistingPhotos((prev) => prev.filter((p) => p.id !== attachmentId))
      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.detail(editId) })
      toast.success('Foto eliminada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar la foto')
    }
  }

  const canSubmit = !!selectedAsset && hasCirculationCard !== null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAsset || hasCirculationCard === null) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const checklistPayload = {
        hasCirculationCard,
        comments: comments.trim() || undefined,
      }
      const auditId = isEditing
        ? (await insuranceAuditsApi.update(editId!, { checklist: checklistPayload })).id
        : (await insuranceAuditsApi.create({ assetId: selectedAsset.id, checklist: checklistPayload })).id

      await Promise.all(pendingPhotos.map((file) => insuranceAuditsApi.addAttachment(auditId, file)))

      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
      if (isEditing) queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.detail(auditId) })
      toast.success(isEditing ? 'Auditoría actualizada correctamente' : 'Auditoría registrada correctamente')
      navigate(ROUTES.INSURANCE_AUDITS_DETAIL(auditId))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al registrar la auditoría')
      setSubmitting(false)
    }
  }

  if (isEditing && !seeded) {
    return (
      <PageContent>
        <p className="text-sm text-slate-400 py-10 text-center">Cargando auditoría…</p>
      </PageContent>
    )
  }

  return (
    <PageContent>
      <PageHeader
        title={isEditing ? 'Editar auditoría' : 'Auditoría de Seguros'}
        subtitle={isEditing ? 'Corregir una auditoría pendiente de revisión' : 'Verificar la tarjeta de circulación de un vehículo o maquinaria'}
        category="Auditoría de Seguros"
        backTo={isEditing ? ROUTES.INSURANCE_AUDITS_DETAIL(editId!) : ROUTES.INSURANCE_AUDITS}
        backLabel={isEditing ? 'Volver a la auditoría' : 'Volver a Auditoría de Seguros'}
      />

      <form onSubmit={handleSubmit}>
        <SectionCard title="Activo" className="mb-5">
          {/* Editando, o llegando desde "Auditar" en la pestaña de Cobertura
              (activo ya resuelto vía ?assetId=) — la selección ya está
              decidida, no hace falta mostrar el buscador de nuevo. */}
          {(isEditing || preselectedId) && selectedAsset ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Package size={16} className="text-brand-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{selectedAsset.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedAsset.assetType} · {selectedAsset.code ?? '—'}
                  {selectedAsset.plate ? ` · ${selectedAsset.plate}` : ''}
                </p>
              </div>
            </div>
          ) : !isEditing && !preselectedId ? (
            <AssetPicker selected={selectedAsset} onSelect={handleSelectFromCoverage} coverage={coverage} isLoading={coverageLoading} />
          ) : (
            <p className="text-sm text-slate-400">Cargando activo…</p>
          )}
        </SectionCard>

        {selectedAsset && <CirculationCardReferenceCard card={referenceCard} assetId={selectedAsset.id} />}

        <SectionCard title="Checklist" className="mb-5">
          <div className="space-y-4">
            <FormField label="¿Tiene la tarjeta de circulación a bordo?" required>
              <ChoiceGroup
                options={CIRCULATION_CARD_OPTIONS}
                value={hasCirculationCard === null ? '' : hasCirculationCard ? 'yes' : 'no'}
                onChange={(v) => setHasCirculationCard(v === 'yes')}
              />
            </FormField>

            <FormField label="Comentarios (opcional)">
              <FormTextarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Observaciones de la verificación…" />
            </FormField>

            {existingPhotos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Fotos ya cargadas</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                  {existingPhotos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                      <img src={photo.fileUrl} alt={photo.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingPhoto(photo.id)}
                        className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors"
                        title="Quitar foto"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <FileDropzone
              label="Fotos del activo (hasta 10)"
              accept="image/jpeg,image/png,image/webp"
              maxFiles={10}
              enableCamera
              onFilesPicked={(files) => setPendingPhotos([...pendingPhotos, ...files].slice(0, 10))}
            />
          </div>
        </SectionCard>

        {submitError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-5">{submitError}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {isEditing ? 'Guardar cambios' : 'Enviar auditoría'}
          </button>
        </div>
      </form>
    </PageContent>
  )
}
