import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import { resolveAuditScope } from '../../shared/services/audit-scope.service'
import { assetFireExtinguisherAuditsService as assetAuditsService } from '../fire-extinguisher-audits/fire-extinguisher-audits.service'
import { assetFireExtinguisherAuditDashboardService as assetAuditDashboardService } from '../fire-extinguisher-audits/fire-extinguisher-audit-dashboard.service'
import type {
  ListFireExtinguisherAuditsQueryDTO,
  CoverageQueryDTO,
  AuditDashboardQueryDTO,
  AuditorProgressQueryDTO,
} from '../fire-extinguisher-audits/fire-extinguisher-audits.schemas'

type IdParam = { id: string }
type AttachmentParam = { id: string; attachmentId: string }

// "Auditoría de Activos" audita los FireExtinguisher montados en un
// vehículo/maquinaria (población ASSET) reutilizando el motor de
// fire-extinguisher-audits.service.ts/.dashboard.service.ts — ver
// fire-extinguisher-audits.population.ts. Único módulo "de auditar" de esta
// área — nunca 'asset_audits' (revisión), para que un revisor nunca quede
// restringido por scope.
const COVERAGE_MODULES = ['asset_audit_coverage'] as const

export const assetAuditsController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const audit = await assetAuditsService.create(req.body, req.user.email, scope)
    res.status(201).json({ data: audit })
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const result = await assetAuditsService.findAll(req.query as unknown as ListFireExtinguisherAuditsQueryDTO, scope)
    res.json(result)
  }),

  coverage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const { period } = req.query as unknown as CoverageQueryDTO
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const data = await assetAuditsService.getCoverage(period, scope)
    res.json({ data })
  }),

  auditDashboard: asyncHandler(async (req: Request, res: Response) => {
    const { period, category } = req.query as unknown as AuditDashboardQueryDTO
    const data = await assetAuditDashboardService.getAuditDashboard(period, category)
    res.json({ data })
  }),

  auditorProgress: asyncHandler(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as AuditorProgressQueryDTO
    const data = await assetAuditDashboardService.getAuditorProgress(period)
    res.json({ data })
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const audit = await assetAuditsService.findById(req.params.id, scope)
    res.json({ data: audit })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const audit = await assetAuditsService.update(req.params.id, req.body, scope)
    res.json({ data: audit })
  }),

  review: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const audit = await assetAuditsService.review(
      req.params.id,
      req.body,
      req.user?.email ?? 'sistema',
      req.user?.role === 'ADMIN',
    )
    res.json({ data: audit })
  }),

  bulkApprove: asyncHandler(async (req: Request, res: Response) => {
    const result = await assetAuditsService.bulkApprove(
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
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const attachment = await assetAuditsService.addAttachment(req.params.id, req.file, req.body, req.user.email, scope)
    res.status(201).json({ data: attachment })
  }),

  deleteAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    await assetAuditsService.deleteAttachment(req.params.id, req.params.attachmentId, scope)
    res.json({ data: { message: 'Adjunto eliminado correctamente' } })
  }),

  downloadAttachment: asyncHandler(async (req: Request<AttachmentParam>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const scope = await resolveAuditScope(req.user, 'ASSET_AUDIT', [...COVERAGE_MODULES])
    const attachment = await assetAuditsService.getAttachmentForDownload(req.params.id, req.params.attachmentId, scope)
    await sendAttachmentDownload(res, attachment)
  }),
}
