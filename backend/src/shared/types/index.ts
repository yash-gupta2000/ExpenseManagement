import { Request } from 'express';

export interface RequestContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

// Augment Express Request to carry context
declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

export type AuthenticatedRequest = Request;

export interface SuccessResponse<T> {
  data: T;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type UserRole = 'employee' | 'manager' | 'financeAdmin' | 'orgAdmin';

export type ExpenseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID';

export type WorkflowStatus = 'ACTIVE' | 'COMPLETED' | 'REJECTED' | 'RETURNED';

export type StepStatus = 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

export type ChainType = 'STANDARD' | 'ELEVATED';

export type ResolverType = 'ROLE' | 'USER' | 'MANAGER';

export type AuditAction =
  | 'SUBMITTED'
  | 'STEP_APPROVED'
  | 'FULLY_APPROVED'
  | 'REJECTED'
  | 'SENT_BACK'
  | 'WITHDRAWN'
  | 'MARKED_PAID';
