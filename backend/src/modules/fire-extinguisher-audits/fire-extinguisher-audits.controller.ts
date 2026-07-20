import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import { fireExtinguisherAuditsService } from './fire-extinguisher-audits.service'
import type { ListFireExtinguisherAuditsQueryDTO, CoverageQueryDTO } from './fire-extinguisher-audits.schemas'

type IdParam = { id: string }
type AttachmentParam = { id: string; attachmentId: string }

export const fireExtinguisherAuditsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const audit = await fireExtinguisherAuditsService.create(req.body, req.user?.email ?? 'sistema')
    res.status(201).json({ data: audit })
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await fireExtinguisherAuditsService.findAll(req.query as unknown as ListFireExtinguisherAuditsQueryDTO)
    res.json(result)
  }),

  coverage: asyncHandler(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as CoverageQueryDTO
    const data = await fireExtinguisherAuditsService.getCoverage(period)
    res.json({ data })
  }),

  findingsReport: asyncHandler(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as CoverageQueryDTO
    const data = await fireExtinguisherAuditsService.getFindingsReport(period)
    res.json({ data })
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const audit = await fireExtinguisherAuditsService.findById(req.params.id)
    res.json({ data: audit })
  }),

  review: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const audit = await fireExtinguisherAuditsService.review(req.params.id, req.body, req.user?.email ?? 'sistema')
    res.json({ data: audit })
  }),

  addAttachment: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.file) throw new AppError(400, 'Se requiere un archivo adjunto', 'BAD_REQUEST')
    const attachment = await fireExtinguisherAuditsService.addAttachment(
      req.params.id,
      req.file,
      req.body,
      req.user?.email ?? 'sistema',
    )
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    await fireExtinguisherAuditsService.deleteAttachment(req.params.id, req.params.attachmentId)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    const attachment = await fireExtinguisherAuditsService.getAttachmentForDownload(req.params.id, req.params.attachmentId)
    await sendAttachmentDownload(res, attachment)
  }),
}
