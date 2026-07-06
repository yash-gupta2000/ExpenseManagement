import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../shared/errors';
import { AuthenticatedRequest, RequestContext } from '../shared/types';

interface JwtPayload {
  userId: string;
  tenantId: string;
  roles: string[];
}

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.slice(7);

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.context = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      roles: decoded.roles,
    } as RequestContext;

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}
