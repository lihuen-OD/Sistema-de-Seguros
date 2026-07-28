import { X } from 'lucide-react'
import { ChoiceGroup } from '../../../shared/components/forms/ChoiceGroup'
import { FormField, FormInput, FormTextarea } from '../../../shared/components/forms/FormSection'
import { FileDropzone } from '../../../shared/components/file-upload/FileDropzone'
import { CHECKLIST_FIELDS } from './checklistConfig'

export interface ExistingAuditPhoto {
  id: string
  url: string
  name: string
}

interface AuditStep4ChecklistProps {
  checklist: Record<string, string>
  onChangeChecklist: (next: Record<string, string>) => void
  comments: string
  onChangeComments: (value: string) => void
  pendingPhotos: File[]
  onChangePhotos: (files: File[]) => void
  /** Vencimiento vigente (ya validado en el Paso 3) — precarga el observado y explica por qué. */
  masterExpirationDate: string
  /** Fotos ya guardadas en la auditoría — solo se pasan al editar una auditoría existente. */
  existingPhotos?: ExistingAuditPhoto[]
  onRemoveExistingPhoto?: (id: string) => void
}

export function AuditStep4Checklist({
  checklist,
  onChangeChecklist,
  comments,
  onChangeComments,
  pendingPhotos,
  onChangePhotos,
  masterExpirationDate,
  existingPhotos,
  onRemoveExistingPhoto,
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
              {field.key === 'chargeExpirationDateObserved' && !checklist[field.key] && (
                <p className="text-xs text-slate-400">Dejalo en blanco si no se conoce la fecha de vencimiento.</p>
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

      {existingPhotos && existingPhotos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Fotos ya guardadas</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
            {existingPhotos.map((photo) => (
              <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                <img src={photo.url} alt={photo.name} className="w-full h-full object-cover" />
                {onRemoveExistingPhoto && (
                  <button
                    type="button"
                    onClick={() => onRemoveExistingPhoto(photo.id)}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Quitar foto"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
