import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Role, UserAuditScopeItem } from '../types'

export interface AppUser {
  id: string
  name: string
  email: string
  role: Role
  accessProfileId: string | null
  accessProfileName: string | null
  auditScope: UserAuditScopeItem[]
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface CreateUserInput {
  name: string
  email: string
  role: Role
  accessProfileId?: string | null
  password: string
  auditScope?: UserAuditScopeItem[]
}

export interface UpdateUserInput {
  name?: string
  email?: string
  role?: Role
  accessProfileId?: string | null
  isActive?: boolean
  auditScope?: UserAuditScopeItem[]
}

export const usersApi = {
  async findAll(): Promise<AppUser[]> {
    const res = await apiClient.get<{ data: AppUser[] }>('/users')
    return res.data.data
  },

  async create(input: CreateUserInput): Promise<AppUser> {
    const res = await apiClient.post<{ data: AppUser }>('/users', input)
    return res.data.data
  },

  async update(id: string, input: UpdateUserInput): Promise<AppUser> {
    const res = await apiClient.put<{ data: AppUser }>(`/users/${id}`, input)
    return res.data.data
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await apiClient.post(`/users/${id}/reset-password`, { newPassword })
  },
}

export const userKeys = {
  all: ['users'] as const,
}

export const userQueries = {
  list: () =>
    queryOptions({
      queryKey: userKeys.all,
      queryFn: () => usersApi.findAll(),
      staleTime: 60 * 1000,
    }),
}
