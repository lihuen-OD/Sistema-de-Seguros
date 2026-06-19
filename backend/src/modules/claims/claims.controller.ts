import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { claimsService } from './claims.service'
import type { ListClaimsQueryDTO, AddEventDTO } from './claims.schemas'

type IdParam = { id: string }
type EventParam = { id: string; eventId: string }

export const claimsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await claimsService.findAll(req.query as unknown as ListClaimsQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const claim = await claimsService.findById(req.params.id)
    res.json({ data: claim })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const claim = await claimsService.create(req.body, req.user?.email)
    res.status(201).json({ data: claim })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const claim = await claimsService.update(req.params.id, req.body)
    res.json({ data: claim })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await claimsService.softDelete(req.params.id)
    res.json({ data: { message: 'Siniestro desactivado correctamente' } })
  }),

  // ── Events ────────────────────────────────────────────────────────────────────

  getEvents: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const events = await claimsService.findEvents(req.params.id)
    res.json({ data: events })
  }),

  addEvent: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const event = await claimsService.addEvent(req.params.id, req.body as AddEventDTO)
    res.status(201).json({ data: event })
  }),

  deleteEvent: asyncHandler(async (req: Request<EventParam>, res: Response) => {
    await claimsService.deleteEvent(req.params.id, req.params.eventId)
    res.json({ data: { message: 'Evento eliminado correctamente' } })
  }),
}
