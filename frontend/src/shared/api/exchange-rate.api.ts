import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export interface ExchangeRateCurrent {
  rate: number | null
  updatedBy: string | null
  updatedAt: string | null
}

export interface ExchangeRateEntry {
  id: string
  rate: number
  updatedBy: string | null
  createdAt: string
}

export const exchangeRateApi = {
  getCurrent: () =>
    apiClient.get<{ data: ExchangeRateCurrent }>('/exchange-rate/current').then((r) => r.data.data),

  getHistory: () =>
    apiClient.get<{ data: ExchangeRateEntry[] }>('/exchange-rate/history').then((r) => r.data.data),

  setCurrent: (rate: number) =>
    apiClient.post<{ data: ExchangeRateEntry }>('/exchange-rate', { rate }).then((r) => r.data.data),
}

export const exchangeRateKeys = {
  all: ['exchange-rate'] as const,
  current: () => [...exchangeRateKeys.all, 'current'] as const,
  history: () => [...exchangeRateKeys.all, 'history'] as const,
}

export const exchangeRateQueries = {
  current: () =>
    queryOptions({
      queryKey: exchangeRateKeys.current(),
      queryFn: exchangeRateApi.getCurrent,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: 'always',
    }),
  history: () =>
    queryOptions({
      queryKey: exchangeRateKeys.history(),
      queryFn: exchangeRateApi.getHistory,
      staleTime: 5 * 60 * 1000,
    }),
}
