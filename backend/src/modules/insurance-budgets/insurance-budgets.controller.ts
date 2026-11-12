import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { insuranceBudgetsService } from './insurance-budgets.service'
import type {
  BudgetAuditLogQueryDTO,
  CreateBudgetDTO,
  ListBudgetsQueryDTO,
  UpdateBudgetDTO,
} from './insurance-budgets.schemas'

// authMiddleware garantiza req.user en todas las rutas de este router; el
// email queda como autor en el historial (performedBy/createdBy/updatedBy).
function actor(req: Request): string {
  return req.user!.email
}

export const insuranceBudgetsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const budgets = await insuranceBudgetsService.findAll(req.query as unknown as ListBudgetsQueryDTO)
    res.json({ data: budgets })
  }),

  create: asyncHandler(async (req: Request<unknown, unknown, CreateBudgetDTO>, res: Response) => {
    const budget = await insuranceBudgetsService.create(req.body, actor(req as unknown as Request))
    res.status(201).json({ data: budget })
  }),

  update: asyncHandler(async (req: Request<{ id: string }, unknown, UpdateBudgetDTO>, res: Response) => {
    const budget = await insuranceBudgetsService.update(req.params.id, req.body, actor(req as unknown as Request))
    res.json({ data: budget })
  }),

  auditLog: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const result = await insuranceBudgetsService.findAuditLog(req.params.id, req.query as unknown as BudgetAuditLogQueryDTO)
    res.json(result)
  }),
}
