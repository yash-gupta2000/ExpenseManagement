import { Response, NextFunction } from 'express';
import { ExpenseService } from './expense.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../../shared/types';

export class ExpenseController {
  constructor(
    private expenseService: ExpenseService,
    private auditService: AuditService
  ) {}

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expense = await this.expenseService.createExpense(req.context, req.body);
      res.status(201).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expense = await this.expenseService.updateExpense(
        req.context,
        req.params.id,
        req.body
      );
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expense = await this.expenseService.getExpenseById(req.context, req.params.id);
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page = 1, limit = 20, status } = req.query as {
        page?: number;
        limit?: number;
        status?: string;
      };

      const { expenses, total } = await this.expenseService.listExpenses(
        req.context,
        Number(page),
        Number(limit),
        status
      );

      res.status(200).json({
        data: expenses,
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

  submit = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expense = await this.expenseService.submitExpense(req.context, req.params.id);
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  withdraw = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const expense = await this.expenseService.withdrawExpense(req.context, req.params.id);
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  markPaid = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const expense = await this.expenseService.markPaid(req.context, req.params.id);
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  approve = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const expense = await this.expenseService.approveExpense(
        req.context,
        req.params.id,
        req.body.comment
      );
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expense = await this.expenseService.rejectExpense(
        req.context,
        req.params.id,
        req.body.comment
      );
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  sendBack = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const expense = await this.expenseService.sendBackExpense(
        req.context,
        req.params.id,
        req.body.comment
      );
      res.status(200).json({ data: expense });
    } catch (error) {
      next(error);
    }
  };

  getAuditLog = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Verify the expense exists and is accessible
      await this.expenseService.getExpenseById(req.context, req.params.id);
      const logs = await this.auditService.getExpenseLogs(req.params.id);
      res.status(200).json({ data: logs });
    } catch (error) {
      next(error);
    }
  };
}
