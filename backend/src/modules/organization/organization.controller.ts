import { Response, NextFunction } from 'express';
import { OrganizationService } from './organization.service';
import { AuthenticatedRequest } from '../../shared/types';

export class OrganizationController {
  constructor(private orgService: OrganizationService) {}

  get = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const org = await this.orgService.getOrganization(req.context.tenantId);
      res.status(200).json({ data: org });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const org = await this.orgService.updateSettings(req.context.tenantId, req.body);
      res.status(200).json({ data: org });
    } catch (error) {
      next(error);
    }
  };
}
