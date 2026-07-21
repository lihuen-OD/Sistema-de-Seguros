import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, KeyRound } from 'lucide-react'
import { authApi, authQueries, authKeys } from '../../shared/api/auth.api'
import { getStoredToken } from '../../shared/api/auth'
import { FormField, FormInput } from '../../shared/components/forms/FormSection'
import { PasswordInput } from '../../shared/components/forms/PasswordInput'
import { LoadingState } from '../../shared/components/empty-states/LoadingState'

// Ruta standalone (como /login, fuera de AppLayout): sirve tanto para el
// cambio obligatorio (mustChangePassword=true, sin currentPassword) como
// para un cambio voluntario más adelante (currentPassword requerido). El
// backend ya distingue ambos casos — ver auth.service.ts#changePassword.
export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasToken = Boolean(getStoredToken())

  const { data: user, isLoading } = useQuery({ ...authQueries.me(), enabled: hasToken })

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!hasToken) {
    navigate('/login', { replace: true })
    return null
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm">
          <LoadingState rows={3} />
        </div>
      </div>
    )
  }

  const forced = user.mustChangePassword

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('La contraseña debe tener al menos 8 caracteres, una letra y un número')
      return
    }

    setSubmitting(true)
    try {
      await authApi.changePassword({
        currentPassword: forced ? undefined : currentPassword,
        newPassword,
      })
      await queryClient.invalidateQueries({ queryKey: authKeys.me })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-11 h-11 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center p-1">
            <img src="/logo.png" alt="LOS O'D" className="w-full h-full object-contain" />
          </div>
          <span className="text-slate-900 font-semibold text-base">Seguridad</span>
          <span className="text-slate-400 text-xs">LOS O'D</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
        >
          <div>
            <h1 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <KeyRound size={15} className="text-brand-600" />
              Cambiar contraseña
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {forced
                ? 'Tenés una contraseña temporal. Elegí una nueva antes de continuar.'
                : `Sesión de ${user.name}`}
            </p>
          </div>

          {!forced && (
            <FormField label="Contraseña actual" fullWidth>
              <PasswordInput
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </FormField>
          )}

          <FormField label="Contraseña nueva" fullWidth>
            <PasswordInput
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>

          <FormField label="Confirmar contraseña nueva" fullWidth>
            <PasswordInput
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>

          <p className="text-xs text-slate-400 -mt-2">
            Mínimo 8 caracteres, con al menos una letra y un número.
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Guardar contraseña
          </button>

          {!forced && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
