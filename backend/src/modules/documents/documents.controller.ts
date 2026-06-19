import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { documentsService } from './documents.service'
import { AppError } from '../../shared/errors/AppError'
import type {
  ListDocumentsQueryDTO,
  UpdateInstallmentDTO,
  ReplaceInstallmentsDTO,
  ReplaceAllocationsDTO,
} from './documents.schemas'

type IdParam = { id: string }
type InstallmentParam = { id: string; installmentId: string }
type AttachmentParam = { id: string; attachmentId: string }

export const documentsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.findAll(req.query as unknown as ListDocumentsQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const doc = await documentsService.findById(req.params.id)
    res.json({ data: doc })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const doc = await documentsService.create(req.body)
    res.status(201).json({ data: doc })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const doc = await documentsService.update(req.params.id, req.body)
    res.json({ data: doc })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await documentsService.delete(req.params.id)
    res.json({ data: { message: 'Documento eliminado correctamente' } })
  }),

  // ── Installments ──────────────────────────────────────────────────────────────

  getInstallments: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const installments = await documentsService.findInstallments(req.params.id)
    res.json({ data: installments })
  }),

  replaceInstallments: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const installments = await documentsService.replaceInstallments(
      req.params.id,
      req.body as ReplaceInstallmentsDTO,
    )
    res.json({ data: installments })
  }),

  updateInstallment: asyncHandler(async (req: Request<InstallmentParam>, res: Response) => {
    const installment = await documentsService.updateInstallment(
      req.params.id,
      req.params.installmentId,
      req.body as UpdateInstallmentDTO,
    )
    res.json({ data: installment })
  }),

  // ── Allocations ───────────────────────────────────────────────────────────────

  getAllocations: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const allocations = await documentsService.findAllocations(req.params.id)
    res.json({ data: allocations })
  }),

  replaceAllocations: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const allocations = await documentsService.replaceAllocations(
      req.params.id,
      req.body as ReplaceAllocationsDTO,
    )
    res.json({ data: allocations })
  }),

  // ── Attachments ───────────────────────────────────────────────────────────────

  getAttachments: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const attachments = await documentsService.findAttachments(req.params.id)
    res.json({ data: attachments })
  }),

  addAttachment: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.file) throw new AppError(400, 'Se requiere un archivo adjunto', 'BAD_REQUEST')
    const attachment = await documentsService.addAttachment(
      req.params.id,
      req.file,
      req.body,
      req.user?.email ?? 'sistema',
    )
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    await documentsService.deleteAttachment(req.params.id, req.params.attachmentId)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),
}
