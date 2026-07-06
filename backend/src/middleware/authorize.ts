import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../shared/types';
import { ForbiddenError } from '../shared/errors';

export function authorize(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const userRoles = req.context?.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
