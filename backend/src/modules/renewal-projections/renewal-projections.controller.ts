import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { renewalProjectionsService } from './renewal-projections.service'
import type { UpsertRenewalProjectionOverrideDTO } from './renewal-projections.schemas'

export const renewalProjectionsController = {
  list: asyncHandler(async (req: Request<{ mode: string }>, res: Response) => {
    const overrides = await renewalProjectionsService.findAll(req.params.mode)
    res.json({ data: overrides })
  }),

  upsert: asyncHandler(async (req: Request<{ mode: string; assetId: string }, unknown, UpsertRenewalProjectionOverrideDTO>, res: Response) => {
    const override = await renewalProjectionsService.upsert(req.params.assetId, req.params.mode, req.body)
    res.json({ data: override })
  }),

  reset: asyncHandler(async (req: Request<{ mode: string; assetId: string }>, res: Response) => {
    await renewalProjectionsService.reset(req.params.assetId, req.params.mode)
    res.json({ data: { message: 'Override eliminado, vuelve al valor automático' } })
  }),
}
