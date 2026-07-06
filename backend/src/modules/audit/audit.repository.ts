import { AuditLog, IAuditLog } from './audit.model';
import { Types } from 'mongoose';
import { AuditAction } from '../../shared/types';

export interface CreateAuditLogData {
  tenantId: string | Types.ObjectId;
  expenseId: string | Types.ObjectId;
  actorId: string | Types.ObjectId;
  actorName: string;
  action: AuditAction;
  stepIndex?: number;
  comment?: string;
}

export class AuditRepository {
  async create(data: CreateAuditLogData): Promise<IAuditLog> {
    const log = new AuditLog(data);
    return log.save();
  }

  async findByExpense(
    expenseId: string | Types.ObjectId
  ): Promise<IAuditLog[]> {
    return AuditLog.find({ expenseId }).sort({ timestamp: 1 }).exec();
  }
}
