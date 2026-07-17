import { ChoiceGroup } from '../../../shared/components/forms/ChoiceGroup'
import { FormField, FormInput, FormTextarea } from '../../../shared/components/forms/FormSection'
import { FileDropzone } from '../../../shared/components/file-upload/FileDropzone'
import { CHECKLIST_FIELDS } from './checklistConfig'

interface AuditStep4ChecklistProps {
  checklist: Record<string, string>
  onChangeChecklist: (next: Record<string, string>) => void
  comments: string
  onChangeComments: (value: string) => void
  pendingPhotos: File[]
  onChangePhotos: (files: File[]) => void
  /** Vencimiento vigente (ya validado en el Paso 3) — precarga el observado y explica por qué. */
  masterExpirationDate: string
}

export function AuditStep4Checklist({
  checklist,
  onChangeChecklist,
  comments,
  onChangeComments,
  pendingPhotos,
  onChangePhotos,
  masterExpirationDate,
}: AuditStep4ChecklistProps) {
  function setField(key: string, value: string) {
    onChangeChecklist({ ...checklist, [key]: value })
  }

  return (
    <div className="space-y-5">
      {CHECKLIST_FIELDS.map((field) => (
        <FormField key={field.key} label={field.label} required={field.required}>
          {field.type === 'choice' ? (
            <ChoiceGroup
              options={field.options ?? []}
              value={checklist[field.key] ?? ''}
              onChange={(v) => setField(field.key, v)}
            />
          ) : (
            <>
              <FormInput
                type={field.type}
                value={checklist[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
                className="sm:max-w-xs"
              />
              {field.key === 'chargeExpirationDateObserved' && checklist[field.key] && checklist[field.key] === masterExpirationDate && (
                <p className="text-xs text-slate-400">
                  Precargada con el vencimiento ya validado en Datos maestros — cambiala solo si la carga física indica otra fecha.
                </p>
              )}
            </>
          )}
        </FormField>
      ))}

      <FormField label="Observaciones">
        <FormTextarea
          value={comments}
          onChange={(e) => onChangeComments(e.target.value)}
          rows={3}
          placeholder="Notas sobre el estado general del equipo…"
        />
      </FormField>

      <FileDropzone
        label="Fotos del matafuego (hasta 10)"
        accept="image/jpeg,image/png,image/webp"
        maxFiles={10}
        enableCamera
        onFilesPicked={(files) => onChangePhotos([...pendingPhotos, ...files].slice(0, 10))}
      />
    </div>
  )
}
