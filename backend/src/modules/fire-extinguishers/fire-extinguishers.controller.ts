import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { fireExtinguishersService } from './fire-extinguishers.service'
import type {
  ListFireExtinguishersQueryDTO,
  RechargeDTO,
  AddHistoryDTO,
} from './fire-extinguishers.schemas'

type IdParam = { id: string }
type AssetParam = { assetId: string }

export const fireExtinguishersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await fireExtinguishersService.findAll(
      req.query as unknown as ListFireExtinguishersQueryDTO,
    )
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const fe = await fireExtinguishersService.findById(req.params.id)
    res.json({ data: fe })
  }),

  getByAsset: asyncHandler(async (req: Request<AssetParam>, res: Response) => {
    const items = await fireExtinguishersService.findByAsset(req.params.assetId)
    res.json({ data: items })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const fe = await fireExtinguishersService.create(req.body)
    res.status(201).json({ data: fe })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const fe = await fireExtinguishersService.update(req.params.id, req.body)
    res.json({ data: fe })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await fireExtinguishersService.softDelete(req.params.id)
    res.json({ data: { message: 'Matafuego desactivado correctamente' } })
  }),

  recharge: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const fe = await fireExtinguishersService.recharge(req.params.id, req.body as RechargeDTO)
    res.json({ data: fe })
  }),

  getHistory: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const history = await fireExtinguishersService.findHistory(req.params.id)
    res.json({ data: history })
  }),

  addHistory: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const entry = await fireExtinguishersService.addHistory(req.params.id, req.body as AddHistoryDTO)
    res.status(201).json({ data: entry })
  }),
}
