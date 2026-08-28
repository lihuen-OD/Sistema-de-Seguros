import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import { resolveAuditScope } from '../../shared/services/audit-scope.service'
import { fireExtinguisherAuditsService } from './fire-extinguisher-audits.service'
import { fireExtinguisherAuditDashboardService } from './fire-extinguisher-audit-dashboard.service'
import type {
  ListFireExtinguisherAuditsQueryDTO,
  CoverageQueryDTO,
  AuditDashboardQueryDTO,
  AuditorProgressQueryDTO,
  CleanlinessHistoryQueryDTO,
  AddCommentDTO,
} from './fire-extinguisher-audits.schemas'

type IdParam = { id: string }
type AttachmentParam = { id: string; attachmentId: string }

// Único módulo "de auditar" de esta área — nunca 'fire_extinguisher_audits'
// (revisión), para que un revisor nunca quede restringido por scope.
const COVERAGE_MODULES = ['fire_extinguisher_audit_coverage'] as const

export const fireExtinguisherAuditsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const audit = await fireExtinguisherAuditsService.create(req.body, req.user.email, scope)
    res.status(201).json({ data: audit })
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const result = await fireExtinguisherAuditsService.findAll(req.query as unknown as ListFireExtinguisherAuditsQueryDTO, scope)
    res.json(result)
  }),

  coverage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { period } = req.query as unknown as CoverageQueryDTO
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const data = await fireExtinguisherAuditsService.getCoverage(period, scope)
    res.json({ data })
  }),

  auditDashboard: asyncHandler(async (req: Request, res: Response) => {
    const { period, establishment } = req.query as unknown as AuditDashboardQueryDTO
    const data = await fireExtinguisherAuditDashboardService.getAuditDashboard(period, establishment)
    res.json({ data })
  }),

  auditorProgress: asyncHandler(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as AuditorProgressQueryDTO
    const data = await fireExtinguisherAuditDashboardService.getAuditorProgress(period)
    res.json({ data })
  }),

  cleanlinessHistory: asyncHandler(async (req: Request, res: Response) => {
    const { periods } = req.query as unknown as CleanlinessHistoryQueryDTO
    const data = await fireExtinguisherAuditDashboardService.getCleanlinessHistory(periods)
    res.json({ data })
  }),

  availablePeriods: asyncHandler(async (_req: Request, res: Response) => {
    const data = await fireExtinguisherAuditDashboardService.getAvailablePeriods()
    res.json({ data })
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const audit = await fireExtinguisherAuditsService.findById(req.params.id, scope)
    res.json({ data: audit })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const audit = await fireExtinguisherAuditsService.update(req.params.id, req.body, scope)
    res.json({ data: audit })
  }),

  review: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const audit = await fireExtinguisherAuditsService.review(
      req.params.id,
      req.body,
      req.user?.email ?? 'sistema',
      req.user?.role === 'ADMIN',
    )
    res.json({ data: audit })
  }),

  bulkApprove: asyncHandler(async (req: Request, res: Response) => {
    const result = await fireExtinguisherAuditsService.bulkApprove(
      req.body.ids,
      req.user?.email ?? 'sistema',
      req.user?.role === 'ADMIN',
      req.body.reviewNotes,
    )
    res.json({ data: result })
  }),

  addAttachment: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    if (!req.file) throw new AppError(400, 'Se requiere un archivo adjunto', 'BAD_REQUEST')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const attachment = await fireExtinguisherAuditsService.addAttachment(
      req.params.id,
      req.file,
      req.body,
      req.user.email,
      scope,
    )
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    await fireExtinguisherAuditsService.deleteAttachment(req.params.id, req.params.attachmentId, scope)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const attachment = await fireExtinguisherAuditsService.getAttachmentForDownload(req.params.id, req.params.attachmentId, scope)
    await sendAttachmentDownload(res, attachment)
  }),

  // Sección "Comentarios" de la pestaña Cobertura — ver comentario en
  // fire-extinguisher-audits.service.ts#getComments/addComment/markCommentSeen.
  comments: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { period } = req.query as unknown as CoverageQueryDTO
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const data = await fireExtinguisherAuditsService.getComments(period, scope)
    res.json({ data })
  }),

  addComment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { targetId, body } = req.body as AddCommentDTO
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const comment = await fireExtinguisherAuditsService.addComment(targetId, body, req.user.email, scope)
    res.status(201).json({ data: comment })
  }),

  markCommentSeen: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'FIRE_EXTINGUISHER_AUDIT', [...COVERAGE_MODULES])
    const comment = await fireExtinguisherAuditsService.markCommentSeen(req.params.id, req.user.email, scope)
    res.json({ data: comment })
  }),
}
