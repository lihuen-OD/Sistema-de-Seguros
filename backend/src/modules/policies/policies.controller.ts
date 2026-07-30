import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { policiesService } from './policies.service'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import type { ListPoliciesQueryDTO } from './policies.schemas'

type IdParam = { id: string }
type CoverageParam = { id: string; coverageId: string }
type AttachmentParam = { id: string; coverageId: string; attachmentId: string }

export const policiesController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await policiesService.findAll(req.query as unknown as ListPoliciesQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const policy = await policiesService.findById(req.params.id)
    res.json({ data: policy })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const policy = await policiesService.create(req.body)
    res.status(201).json({ data: policy })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const policy = await policiesService.update(req.params.id, req.body)
    res.json({ data: policy })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await policiesService.hardDelete(req.params.id)
    res.json({ data: { message: 'Póliza eliminada correctamente' } })
  }),

  markAsDeBaja: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const policy = await policiesService.markAsDeBaja(req.params.id)
    res.json({ data: policy })
  }),

  // Tasks
  getTasks: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const tasks = await policiesService.findTasks(req.params.id)
    res.json({ data: tasks })
  }),

  // Coverage lines
  getCoverages: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const coverages = await policiesService.findCoverages(req.params.id)
    res.json({ data: coverages })
  }),

  replaceCoverages: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const coverages = await policiesService.replaceCoverages(req.params.id, req.body)
    res.json({ data: coverages })
  }),

  // Attachments (por línea de cobertura)
  getAttachments: asyncHandler(async (req: Request<CoverageParam>, res: Response) => {
    const attachments = await policiesService.findAttachments(req.params.id, req.params.coverageId)
    res.json({ data: attachments })
  }),

  addAttachment: asyncHandler(async (req: Request<CoverageParam>, res: Response) => {
    if (!req.file) throw new AppError(400, 'Se requiere un archivo adjunto', 'BAD_REQUEST')
    const attachment = await policiesService.addAttachment(
      req.params.id,
      req.params.coverageId,
      req.file,
      req.body,
      req.user?.email ?? 'sistema',
    )
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    await policiesService.deleteAttachment(req.params.id, req.params.coverageId, req.params.attachmentId)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    const attachment = await policiesService.getAttachmentForDownload(req.params.id, req.params.coverageId, req.params.attachmentId)
    await sendAttachmentDownload(res, attachment)
  }),
}
