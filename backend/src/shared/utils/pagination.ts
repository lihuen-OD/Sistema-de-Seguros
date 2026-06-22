import type { PaginatedResponse } from '../types'

export interface PaginationParams {
  page: number
  limit: number
  skip: number
}

export function getPaginationParams(query: {
  page?: string | number
  limit?: string | number
}): PaginationParams {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 20))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: Pick<PaginationParams, 'page' | 'limit'>,
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    },
  }
}
