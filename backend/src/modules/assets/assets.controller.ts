import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { assetsService } from './assets.service'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import type { ListAssetsQueryDTO, UpdateAttachmentDTO } from './assets.schemas'

type IdParam = { id: string }
type AttachmentParam = { id: string; attachmentId: string }

export const assetsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await assetsService.findAll(req.query as unknown as ListAssetsQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const asset = await assetsService.findById(req.params.id)
    res.json({ data: asset })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const asset = await assetsService.create(req.body)
    res.status(201).json({ data: asset })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const asset = await assetsService.update(req.params.id, req.body)
    res.json({ data: asset })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await assetsService.softDelete(req.params.id)
    res.json({ data: { message: 'Activo desactivado correctamente' } })
  }),

  // Allocations
  replaceAllocations: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const allocations = await assetsService.replaceAllocations(req.params.id, req.body)
    res.json({ data: allocations })
  }),

  // Status history
  getStatusHistory: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const history = await assetsService.findStatusHistory(req.params.id)
    res.json({ data: history })
  }),

  // Value history
  getValueHistory: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const history = await assetsService.findValueHistory(req.params.id)
    res.json({ data: history })
  }),

  addValueHistory: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const entry = await assetsService.addValueHistory(req.params.id, req.body)
    res.status(201).json({ data: entry })
  }),

  // Attachments
  getAttachments: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const attachments = await assetsService.findAttachments(req.params.id)
    res.json({ data: attachments })
  }),

  addAttachment: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.file) throw new AppError(400, 'Se requiere un archivo adjunto', 'BAD_REQUEST')
    const attachment = await assetsService.addAttachment(
      req.params.id,
      req.file,
      req.body,
      req.user?.email ?? 'sistema',
    )
    res.status(201).json({ data: attachment })
  }),

  updateAttachment: asyncHandler(async (req: Request<AttachmentParam, unknown, UpdateAttachmentDTO>, res: Response) => {
    const attachment = await assetsService.updateAttachment(req.params.id, req.params.attachmentId, req.body)
    res.json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    await assetsService.deleteAttachment(req.params.id, req.params.attachmentId)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    const attachment = await assetsService.getAttachmentForDownload(req.params.id, req.params.attachmentId)
    await sendAttachmentDownload(res, attachment)
  }),
}
