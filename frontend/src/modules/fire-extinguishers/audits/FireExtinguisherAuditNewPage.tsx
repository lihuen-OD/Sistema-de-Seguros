import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { fireExtinguisherKeys, fireExtinguisherQueries } from '../../../shared/api/fire-extinguishers.api'
import {
  fireExtinguisherAuditsApi,
  fireExtinguisherAuditKeys,
  fireExtinguisherAuditQueries,
} from '../../../shared/api/fire-extinguisher-audits.api'
import type { AuditChecklistInput, FireExtinguisherAuditAttachment } from '../../../shared/api/fire-extinguisher-audits.api'
import type { FireExtinguisher } from '../../../shared/types'
import { ROUTES } from '../../../app/routes'
import { AuditStep1Selection } from './AuditStep1Selection'
import { AuditStep2Location } from './AuditStep2Location'
import { AuditStep3FieldValidation, FIELD_VALIDATION_CONFIG } from './AuditStep3FieldValidation'
import { AuditStep4Checklist } from './AuditStep4Checklist'
import { AuditStep5Summary } from './AuditStep5Summary'
import { emptyFieldValidationState, type FieldValidationState } from './ValidatedField'
import { isChecklistComplete } from './checklistConfig'

type WizardStep = 1 | 2 | 3 | 4 | 5

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: 'Selección' },
  { id: 2, label: 'Ubicación' },
  { id: 3, label: 'Datos maestros' },
  { id: 4, label: 'Checklist' },
  { id: 5, label: 'Resumen' },
]

export default function FireExtinguisherAuditNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('extinguisherId')

  // Ruta /audits/:id/edit — corrige una auditoría propia SUBMITTED en vez de
  // crear una nueva (ver fire-extinguisher-audits.service.ts's update()).
  const { id: editId } = useParams<{ id?: string }>()
  const isEditing = Boolean(editId)

  const [step, setStep] = useState<WizardStep>(preselectedId || isEditing ? 2 : 1)
  const [maxStepReached, setMaxStepReached] = useState<WizardStep>(preselectedId || isEditing ? 2 : 1)
  const [seeded, setSeeded] = useState(false)

  const [selectedExtinguisher, setSelectedExtinguisher] = useState<FireExtinguisher | null>(null)

  // Viene de la pestaña "Cobertura" con un matafuego puntual — se salta el
  // Paso 1 de selección, que ya se resolvió ahí.
  const { data: preselectedExtinguisher } = useQuery(fireExtinguisherQueries.detail(preselectedId ?? ''))

  useEffect(() => {
    if (preselectedExtinguisher) setSelectedExtinguisher(preselectedExtinguisher)
  }, [preselectedExtinguisher])

  const { data: editingAudit } = useQuery(fireExtinguisherAuditQueries.detail(editId ?? ''))
  const { data: editingExtinguisher } = useQuery(fireExtinguisherQueries.detail(editingAudit?.fireExtinguisherId ?? ''))

  const [locationConfirmed, setLocationConfirmed] = useState<boolean | null>(null)
  const [proposedLocation, setProposedLocation] = useState('')
  const [locationReason, setLocationReason] = useState('')

  const [fieldValidations, setFieldValidations] = useState<Record<string, FieldValidationState>>(() =>
    Object.fromEntries(FIELD_VALIDATION_CONFIG.map((f) => [f.key, emptyFieldValidationState()])),
  )

  const [checklist, setChecklist] = useState<Record<string, string>>({})
  const [checklistComments, setChecklistComments] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [existingPhotos, setExistingPhotos] = useState<FireExtinguisherAuditAttachment[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Precarga el wizard con los datos de la auditoría SUBMITTED a editar — una
  // sola vez, cuando ambos fetches (auditoría + matafuego) ya resolvieron.
  useEffect(() => {
    if (!isEditing || seeded || !editingAudit || !editingExtinguisher) return

    if (editingAudit.status !== 'SUBMITTED') {
      toast.error('Esta auditoría ya no se puede editar porque ya fue revisada')
      navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL(editingAudit.id), { replace: true })
      return
    }

    setSelectedExtinguisher(editingExtinguisher)
    setLocationConfirmed(!editingAudit.locationChangeRequested)
    setProposedLocation(editingAudit.proposedLocation ?? '')
    setLocationReason(editingAudit.locationChangeReason ?? '')
    setFieldValidations(
      Object.fromEntries(
        FIELD_VALIDATION_CONFIG.map((f) => {
          const change = editingAudit.proposedChanges.find((pc) => pc.fieldName === f.key)
          return [
            f.key,
            change
              ? { modified: true, newValue: change.proposedValue, reason: change.reason ?? '' }
              : emptyFieldValidationState(),
          ]
        }),
      ),
    )
    setChecklist({
      cleanliness: editingAudit.checklist.cleanliness,
      chargeFillStatus: editingAudit.checklist.chargeFillStatus,
      beaconPlateCondition: editingAudit.checklist.beaconPlateCondition,
      sealStatus: editingAudit.checklist.sealStatus,
      ringStatus: editingAudit.checklist.ringStatus,
      hoseNozzleCondition: editingAudit.checklist.hoseNozzleCondition,
      chargeExpirationDateObserved: editingAudit.checklist.chargeExpirationDateObserved ?? '',
    })
    setChecklistComments(editingAudit.checklist.comments ?? '')
    setExistingPhotos(editingAudit.attachments.filter((a) => a.fileType === 'image'))
    setStep(2)
    // Ya completó el wizard una vez — puede saltar libremente entre pasos.
    setMaxStepReached(5)
    setSeeded(true)
  }, [isEditing, seeded, editingAudit, editingExtinguisher, navigate])

  // Valor "vigente" de vencimiento tras el Paso 3: el corregido si se marcó
  // Modificar, si no el del maestro — para no pedir de nuevo en el checklist
  // un dato que ya se validó ahí.
  const expirationValidation = fieldValidations.expirationDate
  const effectiveExpirationDate =
    expirationValidation?.modified && expirationValidation.newValue
      ? expirationValidation.newValue
      : selectedExtinguisher?.expirationDate ?? ''

  // Al editar, el matafuego ya quedó fijado en la auditoría original — el
  // Paso 1 (selección) queda bloqueado para no permitir cambiarlo por error.
  function goToStep(next: WizardStep) {
    if (isEditing && next === 1) return
    if (next <= maxStepReached) setStep(next)
  }

  function advance() {
    const next = (Math.min(step + 1, 5) as WizardStep)
    if (step === 3 && !checklist.chargeExpirationDateObserved && effectiveExpirationDate) {
      setChecklist((prev) => ({ ...prev, chargeExpirationDateObserved: effectiveExpirationDate }))
    }
    setStep(next)
    setMaxStepReached((prev) => (prev > next ? prev : next))
  }

  function back() {
    const floor = isEditing ? 2 : 1
    setStep((prev) => (Math.max(prev - 1, floor) as WizardStep))
  }

  async function handleRemoveExistingPhoto(attachmentId: string) {
    if (!editId) return
    try {
      await fireExtinguisherAuditsApi.deleteAttachment(editId, attachmentId)
      setExistingPhotos((prev) => prev.filter((p) => p.id !== attachmentId))
      toast.success('Foto eliminada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar la foto')
    }
  }

  const canAdvance =
    step === 2
      ? locationConfirmed !== null && (locationConfirmed || proposedLocation.trim().length > 0)
      : step === 4
        ? isChecklistComplete(checklist)
        : true

  async function handleSubmit() {
    if (!selectedExtinguisher) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const masterDataReview = FIELD_VALIDATION_CONFIG.map((f) => {
        const state = fieldValidations[f.key]
        return state.modified
          ? { field: f.key, action: 'MODIFICAR' as const, newValue: state.newValue, reason: state.reason.trim() || undefined }
          : { field: f.key, action: 'OK' as const }
      })

      const locationReview =
        locationConfirmed === false
          ? {
              action: 'MODIFICAR' as const,
              proposedLocation: proposedLocation.trim(),
              reason: locationReason.trim() || undefined,
            }
          : { action: 'OK' as const }

      const checklistPayload = {
        ...checklist,
        chargeExpirationDateObserved: checklist.chargeExpirationDateObserved || undefined,
        comments: checklistComments.trim() || undefined,
      } as AuditChecklistInput

      const auditId = isEditing
        ? (
            await fireExtinguisherAuditsApi.update(editId!, { locationReview, masterDataReview, checklist: checklistPayload })
          ).id
        : (
            await fireExtinguisherAuditsApi.create({
              fireExtinguisherId: selectedExtinguisher.id,
              locationReview,
              masterDataReview,
              checklist: checklistPayload,
            })
          ).id

      await Promise.all(pendingPhotos.map((file) => fireExtinguisherAuditsApi.addAttachment(auditId, file)))

      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.detail(selectedExtinguisher.id) })
      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.history(selectedExtinguisher.id) })
      queryClient.invalidateQueries({ queryKey: fireExtinguisherAuditKeys.all })
      if (isEditing) queryClient.invalidateQueries({ queryKey: fireExtinguisherAuditKeys.detail(auditId) })
      toast.success(isEditing ? 'Auditoría actualizada correctamente' : 'Auditoría registrada correctamente')
      navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL(auditId))
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
        title={isEditing ? 'Editar auditoría' : 'Auditoría mensual'}
        subtitle={
          isEditing
            ? 'Corregir una auditoría pendiente de revisión'
            : 'Registrar la inspección física de un matafuego'
        }
        category="Matafuegos"
        backTo={isEditing ? ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL(editId!) : ROUTES.FIRE_EXTINGUISHERS}
        backLabel={isEditing ? 'Volver a la auditoría' : 'Volver a Matafuegos'}
      />

      <SectionCard noPadding>
        <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-100 overflow-x-auto scrollbar-hide">
          {STEPS.map((s) => {
            const isActive = step === s.id
            const isReachable = s.id <= maxStepReached && !(isEditing && s.id === 1)
            return (
              <button
                key={s.id}
                type="button"
                disabled={!isReachable}
                onClick={() => goToStep(s.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : isReachable
                      ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 cursor-not-allowed',
                )}
              >
                <span
                  className={clsx(
                    'flex items-center justify-center w-5 h-5 rounded-full text-xs flex-shrink-0',
                    isActive ? 'bg-white/20' : 'bg-slate-100',
                  )}
                >
                  {s.id}
                </span>
                {s.label}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {step === 1 && (
            <AuditStep1Selection
              selected={selectedExtinguisher}
              onSelect={(fe) => {
                setSelectedExtinguisher(fe)
                advance()
              }}
            />
          )}

          {step === 2 && selectedExtinguisher && (
            <AuditStep2Location
              extinguisher={selectedExtinguisher}
              locationConfirmed={locationConfirmed}
              proposedLocation={proposedLocation}
              reason={locationReason}
              onChange={(next) => {
                setLocationConfirmed(next.locationConfirmed)
                setProposedLocation(next.proposedLocation)
                setLocationReason(next.reason)
              }}
            />
          )}

          {step === 3 && selectedExtinguisher && (
            <AuditStep3FieldValidation
              extinguisher={selectedExtinguisher}
              validations={fieldValidations}
              onChange={setFieldValidations}
            />
          )}

          {step === 4 && (
            <AuditStep4Checklist
              checklist={checklist}
              onChangeChecklist={setChecklist}
              comments={checklistComments}
              onChangeComments={setChecklistComments}
              pendingPhotos={pendingPhotos}
              onChangePhotos={setPendingPhotos}
              masterExpirationDate={effectiveExpirationDate}
              existingPhotos={isEditing ? existingPhotos.map((p) => ({ id: p.id, url: p.fileUrl ?? '', name: p.name })) : undefined}
              onRemoveExistingPhoto={isEditing ? handleRemoveExistingPhoto : undefined}
            />
          )}

          {step === 5 && selectedExtinguisher && (
            <AuditStep5Summary
              extinguisher={selectedExtinguisher}
              locationConfirmed={locationConfirmed}
              proposedLocation={proposedLocation}
              fieldValidations={fieldValidations}
              checklist={checklist}
              comments={checklistComments}
              photoCount={pendingPhotos.length + existingPhotos.length}
              submitting={submitting}
              submitError={submitError}
              onSubmit={handleSubmit}
              submitLabel={isEditing ? 'Guardar cambios' : 'Enviar auditoría'}
            />
          )}
        </div>

        {step > 1 && step < 5 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            {step > (isEditing ? 2 : 1) ? (
              <button
                type="button"
                onClick={back}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Atrás
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={advance}
              disabled={!canAdvance}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </SectionCard>
    </PageContent>
  )
}
