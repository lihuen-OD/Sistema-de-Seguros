import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { claimsService } from './claims.service'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import type { ListClaimsQueryDTO, AddEventDTO, AddClaimAttachmentDTO, CreateExpenseDTO, UpdateExpenseDTO } from './claims.schemas'

type IdParam = { id: string }
type EventParam = { id: string; eventId: string }
type AttachmentParam = { id: string; attachmentId: string }
type ExpenseParam = { id: string; expenseId: string }

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

  // ── Expenses ──────────────────────────────────────────────────────────────────

  getExpenses: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const expenses = await claimsService.findExpenses(req.params.id)
    res.json({ data: expenses })
  }),

  addExpense: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const expense = await claimsService.addExpense(
      req.params.id,
      req.body as CreateExpenseDTO,
      req.user?.email,
    )
    res.status(201).json({ data: expense })
  }),

  updateExpense: asyncHandler(async (req: Request<ExpenseParam>, res: Response) => {
    const expense = await claimsService.updateExpense(
      req.params.id,
      req.params.expenseId,
      req.body as UpdateExpenseDTO,
      req.user?.email,
    )
    res.json({ data: expense })
  }),

  deleteExpense: asyncHandler(async (req: Request<ExpenseParam>, res: Response) => {
    await claimsService.deleteExpense(req.params.id, req.params.expenseId, req.user?.email)
    res.json({ data: { message: 'Gasto eliminado correctamente' } })
  }),

  // ── Attachments ───────────────────────────────────────────────────────────────

  getAttachments: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const attachments = await claimsService.findAttachments(req.params.id)
    res.json({ data: attachments })
  }),

  addAttachment: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.file) throw new AppError(400, 'No se recibió ningún archivo', 'FILE_MISSING')
    const meta = req.body as AddClaimAttachmentDTO
    const attachment = await claimsService.addAttachment(
      req.params.id,
      req.file,
      meta,
      req.user?.email ?? 'sistema',
    )
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    await claimsService.deleteAttachment(req.params.id, req.params.attachmentId)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    const attachment = await claimsService.getAttachmentForDownload(req.params.id, req.params.attachmentId)
    await sendAttachmentDownload(res, attachment)
  }),
}
