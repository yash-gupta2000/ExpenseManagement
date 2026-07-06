import { Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../../shared/types';

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(
        req.body.tenantId || req.headers['x-tenant-id'] as string,
        req.body
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  logout = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.status(200).json({ data: { message: 'Logged out successfully' } });
  };

  changePassword = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.authService.changePassword(
        req.context.userId,
        req.context.tenantId,
        req.body
      );
      res.status(200).json({ data: { message: 'Password changed successfully' } });
    } catch (error) {
      next(error);
    }
  };
}
