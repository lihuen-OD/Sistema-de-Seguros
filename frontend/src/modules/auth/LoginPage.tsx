import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { authApi } from '../../shared/api/auth.api'
import { setToken } from '../../shared/api/auth'
import { FormField, FormInput } from '../../shared/components/forms/FormSection'
import { PasswordInput } from '../../shared/components/forms/PasswordInput'
import { firstAllowedPath } from '../../app/auth/roleScope'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const explicitRedirect = (location.state as { from?: string } | null)?.from

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { token, user } = await authApi.login(email, password)
      setToken(token)
      navigate(explicitRedirect ?? firstAllowedPath(user), { replace: true })
    } catch {
      setError('Credenciales inválidas')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <span className="text-slate-900 font-semibold text-base">Patrimonio Pro</span>
          <span className="text-slate-400 text-xs">LOS OD</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
        >
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Iniciar sesión</h1>
            <p className="text-xs text-slate-500 mt-0.5">Ingresá con tu cuenta para continuar</p>
          </div>

          <FormField label="Email" fullWidth>
            <FormInput
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField label="Contraseña" fullWidth>
            <PasswordInput
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Ingresar
          </button>
        </form>
      </div>
    </div>
  )
}
