import * as path from 'path';
import * as fs from 'fs';
import { env } from '../../config/env';
import { NotFoundError } from '../../shared/errors';
import { ExpenseRepository } from '../expense/expense.repository';

export class ReceiptService {
  constructor(private expenseRepository: ExpenseRepository) {}

  getUploadPath(tenantId: string): string {
    const dir = path.join(env.UPLOAD_DIR, tenantId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  buildFilePath(tenantId: string, filename: string): string {
    return path.join(env.UPLOAD_DIR, tenantId, filename);
  }

  async getReceiptForExpense(
    tenantId: string,
    expenseId: string
  ): Promise<string> {
    const expense = await this.expenseRepository.findById(expenseId, tenantId);
    if (!expense) throw new NotFoundError('Expense not found');

    if (!expense.receiptPath) {
      throw new NotFoundError('No receipt attached to this expense');
    }

    if (!fs.existsSync(expense.receiptPath)) {
      throw new NotFoundError('Receipt file not found on disk');
    }

    return expense.receiptPath;
  }
}
