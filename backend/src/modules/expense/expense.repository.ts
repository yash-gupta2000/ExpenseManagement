import { Expense, IExpense } from './expense.model';
import { Types } from 'mongoose';
import { ExpenseStatus } from '../../shared/types';

export interface ExpenseFilters {
  status?: ExpenseStatus;
  submittedBy?: string | Types.ObjectId;
  page?: number;
  limit?: number;
}

export class ExpenseRepository {
  async findById(
    id: string | Types.ObjectId,
    tenantId?: string | Types.ObjectId
  ): Promise<IExpense | null> {
    const query: Record<string, unknown> = { _id: id };
    if (tenantId) query.tenantId = tenantId;
    return Expense.findOne(query).exec();
  }

  async findByTenant(
    tenantId: string | Types.ObjectId,
    filters: ExpenseFilters = {}
  ): Promise<{ expenses: IExpense[]; total: number }> {
    const { status, submittedBy, page = 1, limit = 20 } = filters;
    const query: Record<string, unknown> = { tenantId };
    if (status) query.status = status;
    if (submittedBy) query.submittedBy = submittedBy;

    const skip = (page - 1) * limit;
    const [expenses, total] = await Promise.all([
      Expense.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Expense.countDocuments(query).exec(),
    ]);
    return { expenses, total };
  }

  async findByApprover(
    tenantId: string | Types.ObjectId,
    approverId: string | Types.ObjectId,
    filters: ExpenseFilters = {}
  ): Promise<{ expenses: IExpense[]; total: number }> {
    const { status, page = 1, limit = 20 } = filters;
    const query: Record<string, unknown> = {
      tenantId,
      $or: [
        { submittedBy: approverId },
        { 'workflowInstance.steps.approverId': approverId },
      ],
    };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [expenses, total] = await Promise.all([
      Expense.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Expense.countDocuments(query).exec(),
    ]);
    return { expenses, total };
  }

  async create(data: Partial<IExpense>): Promise<IExpense> {
    const expense = new Expense(data);
    return expense.save();
  }

  async update(
    id: string | Types.ObjectId,
    tenantId: string | Types.ObjectId,
    data: Partial<IExpense>
  ): Promise<IExpense | null> {
    return Expense.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: data },
      { new: true, runValidators: true }
    ).exec();
  }

  async updateWithOptimisticLock(
    id: string | Types.ObjectId,
    tenantId: string | Types.ObjectId,
    currentVersion: number,
    update: Record<string, unknown>
  ): Promise<IExpense | null> {
    return Expense.findOneAndUpdate(
      {
        _id: id,
        tenantId,
        'workflowInstance.version': currentVersion,
      },
      update,
      { new: true }
    ).exec();
  }
}
