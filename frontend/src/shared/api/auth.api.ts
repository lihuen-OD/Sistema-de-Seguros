import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Role } from '../types'

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface LoginResult {
  token: string
  user: CurrentUser & { mustChangePassword: boolean }
}

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const res = await apiClient.post<{ data: LoginResult }>('/auth/login', { email, password })
    return res.data.data
  },

  async me(): Promise<CurrentUser> {
    const res = await apiClient.get<{ data: CurrentUser }>('/auth/me')
    return res.data.data
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout')
  },

  async changePassword(input: { currentPassword?: string; newPassword: string }): Promise<void> {
    await apiClient.post('/auth/change-password', input)
  },
}

export const authKeys = {
  me: ['auth', 'me'] as const,
}

export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: authKeys.me,
      queryFn: () => authApi.me(),
      staleTime: 5 * 60 * 1000,
      retry: false,
    }),
}
