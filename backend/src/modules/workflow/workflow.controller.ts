import { Response, NextFunction } from 'express';
import { WorkflowService } from './workflow.service';
import { AuthenticatedRequest } from '../../shared/types';

export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  createCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.workflowService.createCategory(
        req.context.tenantId,
        req.body
      );
      res.status(201).json({ data: category });
    } catch (error) {
      next(error);
    }
  };

  listCategories = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { page = 1, limit = 200, isActive } = req.query as { page?: number; limit?: number; isActive?: string };
      const isActiveFilter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;

      const { categories, total } = await this.workflowService.listCategories(
        req.context.tenantId,
        Number(page),
        Number(limit),
        isActiveFilter
      );

      res.status(200).json({
        data: categories,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getCategoryById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.workflowService.getCategoryById(
        req.context.tenantId,
        req.params.id
      );
      res.status(200).json({ data: category });
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.workflowService.updateCategory(
        req.context.tenantId,
        req.params.id,
        req.body
      );
      res.status(200).json({ data: category });
    } catch (error) {
      next(error);
    }
  };

  activateCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.workflowService.activateCategory(
        req.context.tenantId,
        req.params.id
      );
      res.status(200).json({ data: category });
    } catch (error) {
      next(error);
    }
  };

  deactivateCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.workflowService.deactivateCategory(
        req.context.tenantId,
        req.params.id
      );
      res.status(200).json({ data: category });
    } catch (error) {
      next(error);
    }
  };
}
