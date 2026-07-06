import { Types } from 'mongoose';
import { ExpenseRepository } from './expense.repository';
import { IExpense } from './expense.model';
import { CategoryRepository } from '../workflow/category.repository';
import { UserRepository } from '../user/user.repository';
import { AuditRepository } from '../audit/audit.repository';
import { WorkflowEngine } from '../workflow/workflow.engine';
import { WorkflowState } from '../workflow/workflow.state';
import { NotFoundError, ForbiddenError, WorkflowError } from '../../shared/errors';
import { CreateExpenseInput, UpdateExpenseInput } from './expense.validators';
import { RequestContext } from '../../shared/types';

export class ExpenseService {
  private workflowEngine: WorkflowEngine;
  private workflowState: WorkflowState;

  constructor(
    private expenseRepository: ExpenseRepository,
    private categoryRepository: CategoryRepository,
    private userRepository: UserRepository,
    private auditRepository: AuditRepository
  ) {
    this.workflowEngine = new WorkflowEngine(userRepository);
    this.workflowState = new WorkflowState(expenseRepository, auditRepository);
  }

  async createExpense(
    context: RequestContext,
    input: CreateExpenseInput
  ): Promise<IExpense> {
    const category = await this.categoryRepository.findById(
      input.categoryId,
      context.tenantId
    );
    if (!category) throw new NotFoundError('Category not found');

    const expense = await this.expenseRepository.create({
      tenantId: new Types.ObjectId(context.tenantId),
      submittedBy: new Types.ObjectId(context.userId),
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      categoryId: new Types.ObjectId(input.categoryId),
      categoryName: category.name,
      description: input.description,
      receiptPath: input.receiptPath,
      status: 'DRAFT',
      workflowInstance: null,
      workflowHistory: [],
    });

    return expense;
  }

  async updateExpense(
    context: RequestContext,
    expenseId: string,
    input: UpdateExpenseInput
  ): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    this.assertOwnerOrAdmin(context, expense);

    if (expense.status !== 'DRAFT') {
      throw new ForbiddenError('Only DRAFT expenses can be updated');
    }

    const updateData: Partial<IExpense> = { ...input } as Partial<IExpense>;

    if (input.categoryId) {
      const category = await this.categoryRepository.findById(
        input.categoryId,
        context.tenantId
      );
      if (!category) throw new NotFoundError('Category not found');
      updateData.categoryId = new Types.ObjectId(input.categoryId);
      updateData.categoryName = category.name;
    }

    const updated = await this.expenseRepository.update(expenseId, context.tenantId, updateData);
    if (!updated) throw new NotFoundError('Expense not found');
    return updated;
  }

  async getExpenseById(context: RequestContext, expenseId: string): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    this.assertCanView(context, expense);

    return expense;
  }

  async listExpenses(
    context: RequestContext,
    page: number,
    limit: number,
    status?: string
  ): Promise<{ expenses: IExpense[]; total: number }> {
    const { tenantId, userId, roles } = context;

    const isAdminRole = roles.includes('financeAdmin') || roles.includes('orgAdmin');
    const isManager = roles.includes('manager');

    if (isAdminRole) {
      return this.expenseRepository.findByTenant(tenantId, {
        page,
        limit,
        status: status as IExpense['status'],
      });
    }

    if (isManager) {
      return this.expenseRepository.findByApprover(tenantId, userId, {
        page,
        limit,
        status: status as IExpense['status'],
      });
    }

    // Employee: own expenses only
    return this.expenseRepository.findByTenant(tenantId, {
      page,
      limit,
      status: status as IExpense['status'],
      submittedBy: userId,
    });
  }

  async submitExpense(context: RequestContext, expenseId: string): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (expense.submittedBy.toString() !== context.userId) {
      throw new ForbiddenError('Only the expense owner can submit');
    }

    if (expense.status !== 'DRAFT') {
      throw new ForbiddenError('Only DRAFT expenses can be submitted');
    }

    const category = await this.categoryRepository.findById(
      expense.categoryId.toString(),
      context.tenantId
    );

    if (!category) throw new NotFoundError('Category not found');

    if (!category.isActive) {
      throw new WorkflowError(
        'CATEGORY_DEACTIVATED',
        'The expense category is not active',
        400
      );
    }

    const submitter = await this.userRepository.findById(context.userId);
    if (!submitter) throw new NotFoundError('Submitter user not found');

    const workflowInstance = await this.workflowEngine.initializeWorkflow(
      category,
      expense.amount,
      submitter
    );

    const updated = await this.expenseRepository.update(expenseId, context.tenantId, {
      status: 'IN_REVIEW',
      workflowInstance,
    });

    if (!updated) throw new NotFoundError('Expense not found');

    await this.auditRepository.create({
      tenantId: context.tenantId,
      expenseId,
      actorId: context.userId,
      actorName: `${submitter.firstName} ${submitter.lastName}`,
      action: 'SUBMITTED',
    });

    return updated;
  }

  async withdrawExpense(context: RequestContext, expenseId: string): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (expense.submittedBy.toString() !== context.userId) {
      throw new ForbiddenError('Only the expense owner can withdraw');
    }

    if (expense.status !== 'SUBMITTED' && expense.status !== 'IN_REVIEW') {
      throw new ForbiddenError('Only SUBMITTED or IN_REVIEW expenses can be withdrawn');
    }

    const updated = await this.expenseRepository.update(expenseId, context.tenantId, {
      status: 'DRAFT',
      workflowInstance: null,
    });

    if (!updated) throw new NotFoundError('Expense not found');

    const actor = await this.userRepository.findById(context.userId);
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown';

    await this.auditRepository.create({
      tenantId: context.tenantId,
      expenseId,
      actorId: context.userId,
      actorName,
      action: 'WITHDRAWN',
    });

    return updated;
  }

  async markPaid(context: RequestContext, expenseId: string): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (expense.status !== 'APPROVED') {
      throw new ForbiddenError('Only APPROVED expenses can be marked as paid');
    }

    const updated = await this.expenseRepository.update(expenseId, context.tenantId, {
      status: 'PAID',
    });

    if (!updated) throw new NotFoundError('Expense not found');

    const actor = await this.userRepository.findById(context.userId);
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown';

    await this.auditRepository.create({
      tenantId: context.tenantId,
      expenseId,
      actorId: context.userId,
      actorName,
      action: 'MARKED_PAID',
    });

    return updated;
  }

  async approveExpense(
    context: RequestContext,
    expenseId: string,
    comment?: string
  ): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (expense.status !== 'IN_REVIEW') {
      throw new ForbiddenError('Expense is not in review');
    }

    const actor = await this.userRepository.findById(context.userId);
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown';

    return this.workflowState.approve(expense, context.userId, actorName, comment);
  }

  async rejectExpense(
    context: RequestContext,
    expenseId: string,
    comment: string
  ): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (expense.status !== 'IN_REVIEW') {
      throw new ForbiddenError('Expense is not in review');
    }

    const actor = await this.userRepository.findById(context.userId);
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown';

    return this.workflowState.reject(expense, context.userId, actorName, comment);
  }

  async sendBackExpense(
    context: RequestContext,
    expenseId: string,
    comment: string
  ): Promise<IExpense> {
    const expense = await this.expenseRepository.findById(expenseId, context.tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (expense.status !== 'IN_REVIEW') {
      throw new ForbiddenError('Expense is not in review');
    }

    const actor = await this.userRepository.findById(context.userId);
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown';

    return this.workflowState.sendBack(expense, context.userId, actorName, comment);
  }

  private assertOwnerOrAdmin(context: RequestContext, expense: IExpense): void {
    const isAdmin =
      context.roles.includes('financeAdmin') || context.roles.includes('orgAdmin');
    const isOwner = expense.submittedBy.toString() === context.userId;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied');
    }
  }

  private assertCanView(context: RequestContext, expense: IExpense): void {
    const isAdmin =
      context.roles.includes('financeAdmin') || context.roles.includes('orgAdmin');
    const isOwner = expense.submittedBy.toString() === context.userId;
    const isManager = context.roles.includes('manager');

    if (isAdmin || isOwner) return;

    if (isManager) {
      // Manager can view expenses assigned to them
      const isApprover = expense.workflowInstance?.steps.some(
        (s) => s.approverId.toString() === context.userId
      );
      if (isApprover) return;
    }

    throw new ForbiddenError('Access denied');
  }
}
