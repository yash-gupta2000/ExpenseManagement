import { Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { AuthenticatedRequest } from '../../shared/types';

export class UserController {
  constructor(private userService: UserService) {}

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.createUser(req.context.tenantId, req.body);
      res.status(201).json({ data: this.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page = 1, limit = 20, isActive } = req.query as {
        page?: number;
        limit?: number;
        isActive?: string;
      };

      const isActiveFilter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;

      const { users, total } = await this.userService.listUsers(
        req.context.tenantId,
        Number(page),
        Number(limit),
        isActiveFilter
      );

      res.status(200).json({
        data: users.map((u) => this.sanitizeUser(u)),
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

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.getUserById(req.context.tenantId, req.params.id);
      res.status(200).json({ data: this.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.updateUser(
        req.context.tenantId,
        req.params.id,
        req.body
      );
      res.status(200).json({ data: this.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  };

  updateRoles = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.updateRoles(
        req.context.tenantId,
        req.params.id,
        req.body.roles
      );
      res.status(200).json({ data: this.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  };

  activate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.activateUser(req.context.tenantId, req.params.id);
      res.status(200).json({ data: this.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  };

  deactivate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.deactivateUser(req.context.tenantId, req.params.id);
      res.status(200).json({ data: this.sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sanitizeUser(user: any) {
    const obj = user.toJSON ? user.toJSON() : { ...user };
    delete obj.passwordHash;
    return obj;
  }
}
