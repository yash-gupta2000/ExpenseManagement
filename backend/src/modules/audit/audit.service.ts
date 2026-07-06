import { AuditRepository, CreateAuditLogData } from './audit.repository';
import { IAuditLog } from './audit.model';

export class AuditService {
  constructor(private auditRepository: AuditRepository) {}

  async log(data: CreateAuditLogData): Promise<IAuditLog> {
    return this.auditRepository.create(data);
  }

  async getExpenseLogs(expenseId: string): Promise<IAuditLog[]> {
    return this.auditRepository.findByExpense(expenseId);
  }
}
