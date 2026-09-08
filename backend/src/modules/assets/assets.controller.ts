import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { assetsService } from './assets.service'
import { assetPledgesService } from './asset-pledges.service'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import type { CancelAssetPledgeDTO, CreateAssetPledgeDTO, ListAssetsQueryDTO, UpdateAttachmentDTO } from './assets.schemas'

type IdParam = { id: string }
type AttachmentParam = { id: string; attachmentId: string }
type PledgeParam = { id: string; pledgeId: string }

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

  // DELETE = eliminación real (no reversible) — mismo criterio que
  // policies.controller.ts. "Dar de baja" es un estado, no un delete, y vive
  // en su propio endpoint (ver markAsDeBaja).
  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await assetsService.hardDelete(req.params.id)
    res.json({ data: { message: 'Activo eliminado correctamente' } })
  }),

  markAsDeBaja: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const asset = await assetsService.softDelete(req.params.id)
    res.json({ data: asset })
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

  getPledges: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const pledges = await assetPledgesService.findAll(req.params.id)
    res.json({ data: pledges })
  }),

  createPledge: asyncHandler(async (req: Request<IdParam, unknown, CreateAssetPledgeDTO>, res: Response) => {
    const pledge = await assetPledgesService.create(req.params.id, req.body, req.user?.email)
    res.status(201).json({ data: pledge })
  }),

  cancelPledge: asyncHandler(async (req: Request<PledgeParam, unknown, CancelAssetPledgeDTO>, res: Response) => {
    const pledge = await assetPledgesService.cancel(req.params.id, req.params.pledgeId, req.body, req.user?.email)
    res.json({ data: pledge })
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
