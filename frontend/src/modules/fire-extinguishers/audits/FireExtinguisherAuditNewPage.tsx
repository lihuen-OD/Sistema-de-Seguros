import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { fireExtinguisherKeys } from '../../../shared/api/fire-extinguishers.api'
import { fireExtinguisherAuditsApi } from '../../../shared/api/fire-extinguisher-audits.api'
import type { AuditChecklistInput } from '../../../shared/api/fire-extinguisher-audits.api'
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

  const [step, setStep] = useState<WizardStep>(1)
  const [maxStepReached, setMaxStepReached] = useState<WizardStep>(1)

  const [selectedExtinguisher, setSelectedExtinguisher] = useState<FireExtinguisher | null>(null)

  const [locationConfirmed, setLocationConfirmed] = useState<boolean | null>(null)
  const [proposedLocation, setProposedLocation] = useState('')
  const [locationReason, setLocationReason] = useState('')

  const [fieldValidations, setFieldValidations] = useState<Record<string, FieldValidationState>>(() =>
    Object.fromEntries(FIELD_VALIDATION_CONFIG.map((f) => [f.key, emptyFieldValidationState()])),
  )

  const [checklist, setChecklist] = useState<Record<string, string>>({})
  const [checklistComments, setChecklistComments] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function goToStep(next: WizardStep) {
    if (next <= maxStepReached) setStep(next)
  }

  function advance() {
    const next = (Math.min(step + 1, 5) as WizardStep)
    setStep(next)
    setMaxStepReached((prev) => (prev > next ? prev : next))
  }

  function back() {
    setStep((prev) => (Math.max(prev - 1, 1) as WizardStep))
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

      const created = await fireExtinguisherAuditsApi.create({
        fireExtinguisherId: selectedExtinguisher.id,
        locationReview,
        masterDataReview,
        checklist: { ...checklist, comments: checklistComments.trim() || undefined } as AuditChecklistInput,
      })

      await Promise.all(pendingPhotos.map((file) => fireExtinguisherAuditsApi.addAttachment(created.id, file)))

      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.detail(selectedExtinguisher.id) })
      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.history(selectedExtinguisher.id) })
      toast.success('Auditoría registrada correctamente')
      navigate(ROUTES.FIRE_EXTINGUISHERS_DETAIL(selectedExtinguisher.id))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al registrar la auditoría')
      setSubmitting(false)
    }
  }

  return (
    <PageContent>
      <PageHeader
        title="Auditoría mensual"
        subtitle="Registrar la inspección física de un matafuego"
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS}
        backLabel="Volver a Matafuegos"
      />

      <SectionCard noPadding>
        <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-100 overflow-x-auto scrollbar-hide">
          {STEPS.map((s) => {
            const isActive = step === s.id
            const isReachable = s.id <= maxStepReached
            return (
              <button
                key={s.id}
                type="button"
                disabled={!isReachable}
                onClick={() => goToStep(s.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-blue-600 text-white'
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
              photoCount={pendingPhotos.length}
              submitting={submitting}
              submitError={submitError}
              onSubmit={handleSubmit}
            />
          )}
        </div>

        {step > 1 && step < 5 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <button
              type="button"
              onClick={back}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={advance}
              disabled={!canAdvance}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </SectionCard>
    </PageContent>
  )
}
