import { Types } from 'mongoose';
import { IExpenseCategory } from './expense-category.model';
import { IUser } from '../user/user.model';
import { IWorkflowInstance, IWorkflowStep } from '../expense/expense.model';
import { UserRepository } from '../user/user.repository';
import { WorkflowError } from '../../shared/errors';
import { ChainType } from '../../shared/types';

export interface ResolvedStep {
  stepIndex: number;
  approverId: Types.ObjectId;
  approverName: string;
  status: 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
}

export class WorkflowEngine {
  constructor(private userRepository: UserRepository) {}

  async initializeWorkflow(
    category: IExpenseCategory,
    amount: number,
    submitter: IUser
  ): Promise<IWorkflowInstance> {
    const chainType: ChainType = amount > category.amountThreshold ? 'ELEVATED' : 'STANDARD';

    // Walk org tree upward from submitter, collecting each manager
    const managerChain = await this.walkOrgTree(submitter);

    // Always append Finance Admin
    const financeAdmin = await this.userRepository.findActiveByRole(submitter.tenantId, 'financeAdmin');
    if (!financeAdmin) {
      throw new WorkflowError('APPROVER_RESOLUTION_FAILED', 'No active Finance Admin found', 400);
    }

    const approvers: IUser[] = [...managerChain, financeAdmin];

    // For elevated: also append CFO (cfoId on category, or fallback to orgAdmin)
    if (chainType === 'ELEVATED') {
      const cfo = category.cfoId
        ? await this.userRepository.findById(category.cfoId)
        : await this.userRepository.findActiveByRole(submitter.tenantId, 'orgAdmin');

      if (cfo && cfo.isActive) {
        approvers.push(cfo);
      }
    }

    // Build steps, mark self-approvals as SKIPPED
    const steps: ResolvedStep[] = [];
    const seen = new Set<string>(); // deduplicate — same person shouldn't appear twice

    for (const approver of approvers) {
      const aid = approver._id.toString();
      if (seen.has(aid)) continue;
      seen.add(aid);

      const isSelf = aid === submitter._id.toString();
      steps.push({
        stepIndex: steps.length,
        approverId: approver._id,
        approverName: `${approver.firstName} ${approver.lastName}`,
        status: isSelf ? 'SKIPPED' : 'PENDING',
      });
    }

    // All steps skipped? Re-escalate to financeAdmin unconditionally
    const activeSteps = steps.filter((s) => s.status !== 'SKIPPED');
    if (activeSteps.length === 0) {
      throw new WorkflowError(
        'APPROVER_RESOLUTION_FAILED',
        'All resolved approvers are the submitter. Cannot self-approve.',
        400
      );
    }

    // Activate first non-skipped step
    const firstActiveIndex = activeSteps[0].stepIndex;
    const finalSteps = steps.map((s) =>
      s.stepIndex === firstActiveIndex ? { ...s, status: 'ACTIVE' as const } : s
    );

    return {
      categoryId: category._id,
      chainType,
      version: 0,
      status: 'ACTIVE',
      steps: finalSteps as IWorkflowStep[],
      currentStepIndex: firstActiveIndex,
      startedAt: new Date(),
    } as IWorkflowInstance;
  }

  // Walk managerId chain upward.
  // Stops at orgAdmins — they are the CFO tier and only join elevated chains at the end.
  private async walkOrgTree(submitter: IUser): Promise<IUser[]> {
    const chain: IUser[] = [];
    const visited = new Set<string>();
    visited.add(submitter._id.toString());

    let current = submitter;
    while (current.managerId) {
      const mid = current.managerId.toString();
      if (visited.has(mid)) break;
      visited.add(mid);

      const manager = await this.userRepository.findById(current.managerId);
      if (!manager || !manager.isActive) break;
      if (manager.roles.includes('orgAdmin')) break; // orgAdmin = CFO tier, not intermediate

      chain.push(manager);
      current = manager;
    }

    return chain;
  }
}
