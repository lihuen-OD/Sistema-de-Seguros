import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { searchService } from './search.service'
import type { GlobalSearchQueryDTO } from './search.schemas'

export const searchController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const data = await searchService.search(req.user, req.query as unknown as GlobalSearchQueryDTO)
    res.json({ data })
  }),
}
