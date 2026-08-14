import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import { resolveAuditScope } from '../../shared/services/audit-scope.service'
import { insuranceAuditsService } from './insurance-audits.service'
import { insuranceAuditDashboardService } from './insurance-audit-dashboard.service'
import type {
  ListInsuranceAuditsQueryDTO,
  CoverageQueryDTO,
  AuditDashboardQueryDTO,
  AuditorProgressQueryDTO,
  SaveAssignmentDTO,
  AddCommentDTO,
} from './insurance-audits.schemas'

type IdParam = { id: string }
type AttachmentParam = { id: string; attachmentId: string }
type AssetParam = { assetId: string }
type UserParam = { userId: string }

// Único módulo "de auditar" de esta área — nunca 'insurance_audits'
// (revisión), para que un revisor nunca quede restringido por scope.
const COVERAGE_MODULES = ['insurance_audit_coverage'] as const

export const insuranceAuditsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const audit = await insuranceAuditsService.create(req.body, req.user.email, scope)
    res.status(201).json({ data: audit })
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const result = await insuranceAuditsService.findAll(req.query as unknown as ListInsuranceAuditsQueryDTO, scope)
    res.json(result)
  }),

  coverage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { period } = req.query as unknown as CoverageQueryDTO
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const data = await insuranceAuditsService.getCoverage(period, scope)
    res.json({ data })
  }),

  auditDashboard: asyncHandler(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as AuditDashboardQueryDTO
    const data = await insuranceAuditDashboardService.getAuditDashboard(period)
    res.json({ data })
  }),

  auditorProgress: asyncHandler(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as AuditorProgressQueryDTO
    const data = await insuranceAuditDashboardService.getAuditorProgress(period)
    res.json({ data })
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const audit = await insuranceAuditsService.findById(req.params.id, scope)
    res.json({ data: audit })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const audit = await insuranceAuditsService.update(req.params.id, req.body, scope)
    res.json({ data: audit })
  }),

  review: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const audit = await insuranceAuditsService.review(
      req.params.id,
      req.body,
      req.user?.email ?? 'sistema',
      req.user?.role === 'ADMIN',
    )
    res.json({ data: audit })
  }),

  bulkApprove: asyncHandler(async (req: Request, res: Response) => {
    const result = await insuranceAuditsService.bulkApprove(
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
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const attachment = await insuranceAuditsService.addAttachment(req.params.id, req.file, req.body, req.user.email, scope)
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    await insuranceAuditsService.deleteAttachment(req.params.id, req.params.attachmentId, scope)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const attachment = await insuranceAuditsService.getAttachmentForDownload(req.params.id, req.params.attachmentId, scope)
    await sendAttachmentDownload(res, attachment)
  }),

  // Seguimiento de tarjeta de circulación — ver comentario en
  // insurance-audits.service.ts#requestCardUpdate/confirmCardPlaced.
  requestCardUpdate: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const audit = await insuranceAuditsService.requestCardUpdate(req.params.id, req.user.email, scope)
    res.json({ data: audit })
  }),

  confirmCardPlaced: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const audit = await insuranceAuditsService.confirmCardPlaced(req.params.id)
    res.json({ data: audit })
  }),

  // Sección "Comentarios" de la pestaña Cobertura — ver comentario en
  // insurance-audits.service.ts#getComments/addComment/markCommentSeen.
  comments: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { period } = req.query as unknown as CoverageQueryDTO
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const data = await insuranceAuditsService.getComments(period, scope)
    res.json({ data })
  }),

  addComment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { targetId, body } = req.body as AddCommentDTO
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const comment = await insuranceAuditsService.addComment(targetId, body, req.user.email, scope)
    res.status(201).json({ data: comment })
  }),

  markCommentSeen: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    const comment = await insuranceAuditsService.markCommentSeen(req.params.id, req.user.email, scope)
    res.json({ data: comment })
  }),

  // Bytes reales de la tarjeta de circulación (para Ver/Descargar en la
  // app) — ver comentario en insurance-audits.service.ts#downloadCirculationCard.
  downloadCirculationCard: asyncHandler(async (req: Request<AssetParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'INSURANCE_AUDIT', [...COVERAGE_MODULES])
    await insuranceAuditsService.downloadCirculationCard(req.params.assetId, scope, res)
  }),

  // Asignación por activo individual — admin-only (ver insurance-audits.router.ts),
  // sin scope: el admin siempre ve/asigna todo el pool elegible.
  getAssignments: asyncHandler(async (_req: Request, res: Response) => {
    const data = await insuranceAuditsService.getAssignments()
    res.json({ data })
  }),

  saveAssignment: asyncHandler(async (req: Request<UserParam>, res: Response) => {
    const { assetIds } = req.body as SaveAssignmentDTO
    await insuranceAuditsService.saveAssignment(req.params.userId, assetIds)
    res.json({ data: { message: 'Asignación guardada correctamente' } })
  }),
}
