import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, KeyRound, Save, Loader2, Users as UsersIcon, ShieldCheck, UserCheck } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { Modal } from '../../../shared/components/modals/Modal'
import { FormField, FormInput, FormSelect } from '../../../shared/components/forms/FormSection'
import { PasswordInput } from '../../../shared/components/forms/PasswordInput'
import { formatDate } from '../../../shared/utils/format'
import { notifyValidationErrors } from '../../../shared/utils/formValidation'
import {
  usersApi,
  userQueries,
  userKeys,
  type AppUser,
  type CreateUserInput,
  type UpdateUserInput,
} from '../../../shared/api/users.api'
import { accessProfileQueries } from '../../../shared/api/access-profiles.api'
import type { Role, TableColumn } from '../../../shared/types'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  USER: 'Usuario',
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  ADMIN: ShieldCheck,
  USER: UserCheck,
}

// ─── Modal de alta / edición ────────────────────────────────────────────────────

interface UserModalProps {
  user: AppUser | null
  onClose: () => void
  onSave: (input: CreateUserInput | UpdateUserInput) => Promise<void>
}

function UserModal({ user, onClose, onSave }: UserModalProps) {
  const isEdit = user !== null

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'USER')
  const [accessProfileId, setAccessProfileId] = useState(user?.accessProfileId ?? '')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: profiles = [] } = useQuery(accessProfileQueries.list())
  const activeProfiles = profiles.filter((p) => p.isActive || p.id === accessProfileId)

  function validate(): boolean {
    const e: typeof errors = {}
    if (!name.trim()) e.name = 'El nombre es obligatorio'
    if (!email.trim()) e.email = 'El email es obligatorio'
    if (!isEdit && password.length < 8) e.password = 'Mínimo 8 caracteres, con al menos una letra y un número'
    setErrors(e)
    notifyValidationErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    const profileField = { accessProfileId: role === 'USER' ? (accessProfileId || null) : null }
    try {
      if (isEdit) {
        await onSave({ name, email, role, isActive, ...profileField })
      } else {
        await onSave({ name, email, role, password, ...profileField })
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={UsersIcon}
      title={isEdit ? 'Editar usuario' : 'Nuevo usuario'}
      description={isEdit ? user!.email : 'La contraseña que cargues es temporal — la persona la cambia en su primer login.'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nombre" required error={errors.name} fullWidth>
          <FormInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>

        <FormField label="Email" required error={errors.email} fullWidth>
          <FormInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>

        <FormField label="Rol" required fullWidth>
          <FormSelect value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="USER">Usuario</option>
            <option value="ADMIN">Administrador</option>
          </FormSelect>
        </FormField>

        {role === 'USER' && (
          <FormField label="Perfil de acceso" fullWidth>
            <FormSelect value={accessProfileId} onChange={(e) => setAccessProfileId(e.target.value)}>
              <option value="">Sin perfil (sin acceso a ningún módulo)</option>
              {activeProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </FormSelect>
          </FormField>
        )}

        {!isEdit && (
          <FormField label="Contraseña temporal" required error={errors.password} fullWidth>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
        )}

        {isEdit && (
          <FormField label="Estado" fullWidth>
            <FormSelect value={isActive ? 'activo' : 'inactivo'} onChange={(e) => setIsActive(e.target.value === 'activo')}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </FormSelect>
          </FormField>
        )}

        {apiError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{apiError}</p>
        )}

        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Guardar Cambios' : 'Crear Usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal de reseteo de contraseña ─────────────────────────────────────────────

interface ResetPasswordModalProps {
  user: AppUser
  onClose: () => void
  onReset: (newPassword: string) => Promise<void>
}

function ResetPasswordModal({ user, onClose, onReset }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Mínimo 8 caracteres, con al menos una letra y un número')
      return
    }
    setError('')
    setApiError('')
    setSubmitting(true)
    try {
      await onReset(password)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al resetear la contraseña')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={KeyRound}
      title="Resetear contraseña"
      description={`${user.name} va a tener que cambiarla en su próximo login.`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Contraseña temporal nueva" required error={error} fullWidth>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </FormField>

        {apiError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{apiError}</p>
        )}

        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Resetear
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [modalUser, setModalUser] = useState<AppUser | null | undefined>(undefined)
  const [resetUser, setResetUser] = useState<AppUser | null>(null)
  const queryClient = useQueryClient()

  const { data: users = [], isLoading, isError } = useQuery(userQueries.list())

  const activeCount = users.filter((u) => u.isActive).length
  const adminCount = users.filter((u) => u.role === 'ADMIN').length

  async function handleSave(input: CreateUserInput | UpdateUserInput) {
    if (modalUser) {
      await usersApi.update(modalUser.id, input as UpdateUserInput)
    } else {
      await usersApi.create(input as CreateUserInput)
    }
    setModalUser(undefined)
    queryClient.invalidateQueries({ queryKey: userKeys.all })
  }

  async function handleResetPassword(newPassword: string) {
    if (!resetUser) return
    await usersApi.resetPassword(resetUser.id, newPassword)
    setResetUser(null)
  }

  const columns: TableColumn<AppUser>[] = [
    {
      key: 'name',
      label: 'Usuario',
      sortable: true,
      render: (v, row) => (
        <div>
          <span className="font-medium text-slate-800 text-sm block">{String(v)}</span>
          <span className="text-xs text-slate-400">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Rol',
      sortable: true,
      render: (v, row) => {
        const Icon = ROLE_ICONS[String(v)] ?? UserCheck
        return (
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Icon size={13} className="text-slate-400" />
              {ROLE_LABELS[String(v)] ?? String(v)}
            </span>
            {row.role === 'USER' && (
              <span className="text-xs text-slate-400 block mt-0.5">
                {row.accessProfileName ?? 'Sin perfil'}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'lastLoginAt',
      label: 'Último acceso',
      sortable: true,
      render: (v) => (
        <span className="text-xs text-slate-500 tabular-nums">{v ? formatDate(v as string) : 'Nunca'}</span>
      ),
    },
    {
      key: 'isActive',
      label: 'Estado',
      sortable: true,
      render: (v) => <StatusPill status={v ? 'activo' : 'inactivo'} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      className: 'w-24',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setModalUser(row) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Editar usuario"
            aria-label="Editar usuario"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setResetUser(row) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Resetear contraseña"
            aria-label="Resetear contraseña"
          >
            <KeyRound size={15} />
          </button>
        </div>
      ),
    },
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Usuarios"
        subtitle="Acceso al sistema — alta, edición y contraseñas"
        actions={
          <button
            onClick={() => setModalUser(null)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Usuario
          </button>
        }
      />

      <MetricGrid cols={3} className="mb-6">
        <KpiCard label="Usuarios" value={users.length} description="Total registrados" icon={UsersIcon} />
        <KpiCard label="Activos" value={activeCount} description="Pueden iniciar sesión" icon={UserCheck} variant="success" />
        <KpiCard label="Administradores" value={adminCount} description="Acceso total al sistema" icon={ShieldCheck} variant="info" />
      </MetricGrid>

      <SectionCard noPadding>
        <DataTable
          columns={columns}
          data={users}
          loading={isLoading}
          rowKey="id"
          emptyTitle="Sin usuarios"
          emptyDescription="Todavía no se creó ningún usuario."
        />
      </SectionCard>

      {modalUser !== undefined && (
        <UserModal user={modalUser} onClose={() => setModalUser(undefined)} onSave={handleSave} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onReset={handleResetPassword} />
      )}
    </PageContent>
  )
}
