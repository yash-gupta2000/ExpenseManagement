export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  managerId: string | null;
  roles: string[];
  isActive: boolean;
  tenantId: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
  amountThreshold: number; // cents
  standardChain: ChainStep[];
  elevatedChain: ChainStep[];
}

export interface ChainStep {
  stepIndex: number;
  resolverType: 'ROLE' | 'USER' | 'MANAGER';
  resolverValue: string;
}

export interface WorkflowStep {
  stepIndex: number;
  approverId: string;
  approverName: string;
  status: 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  comment: string | null;
  decidedAt: string | null;
}

export interface WorkflowInstance {
  id: string;
  categoryId: string;
  chainType: 'STANDARD' | 'ELEVATED';
  status: 'ACTIVE' | 'COMPLETED' | 'REJECTED' | 'RETURNED';
  version: number;
  steps: WorkflowStep[];
  currentStepIndex: number;
  startedAt: string;
  completedAt: string | null;
}

export interface Expense {
  id: string;
  title: string;
  amount: number; // cents
  currency: string;
  date: string;
  categoryId: string;
  categoryName: string;
  description: string;
  status: 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';
  submittedBy: { id: string; firstName: string; lastName: string };
  workflowInstance: WorkflowInstance | null;
  receiptPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: { id: string; firstName: string; lastName: string };
  stepIndex: number | null;
  comment: string | null;
  timestamp: string;
}

export interface AuthUser {
  userId: string;
  tenantId: string;
  roles: string[];
  email: string;
  firstName: string;
  lastName: string;
}
