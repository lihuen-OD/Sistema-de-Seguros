import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { insuranceTypesService } from './insurance-types.service'
import type { ListInsuranceTypesQueryDTO } from './insurance-types.schemas'

export const insuranceTypesController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await insuranceTypesService.findAll(
      req.query as unknown as ListInsuranceTypesQueryDTO,
    )
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const insuranceType = await insuranceTypesService.findById(req.params.id)
    res.json({ data: insuranceType })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const insuranceType = await insuranceTypesService.create(req.body)
    res.status(201).json({ data: insuranceType })
  }),

  update: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const insuranceType = await insuranceTypesService.update(req.params.id, req.body)
    res.json({ data: insuranceType })
  }),

  remove: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await insuranceTypesService.softDelete(req.params.id)
    res.json({ data: { message: 'Tipo de seguro desactivado correctamente' } })
  }),

  addCoverage: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const coverage = await insuranceTypesService.addCoverage(req.params.id, req.body)
    res.status(201).json({ data: coverage })
  }),

  removeCoverage: asyncHandler(
    async (req: Request<{ id: string; coverageId: string }>, res: Response) => {
      await insuranceTypesService.removeCoverage(req.params.id, req.params.coverageId)
      res.json({ data: { message: 'Cobertura eliminada correctamente' } })
    },
  ),
}
