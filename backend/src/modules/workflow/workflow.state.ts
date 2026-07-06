import { IExpense, IWorkflowInstance } from '../expense/expense.model';
import { ExpenseRepository } from '../expense/expense.repository';
import { AuditRepository } from '../audit/audit.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { Types } from 'mongoose';

export class WorkflowState {
  constructor(
    private expenseRepository: ExpenseRepository,
    private auditRepository: AuditRepository
  ) {}

  async approve(
    expense: IExpense,
    actorId: string,
    actorName: string,
    comment?: string
  ): Promise<IExpense> {
    const instance = expense.workflowInstance;
    if (!instance) {
      throw new ForbiddenError('No active workflow');
    }

    const currentStep = instance.steps.find(
      (s) => s.stepIndex === instance.currentStepIndex
    );

    if (!currentStep || currentStep.status !== 'ACTIVE') {
      throw new ForbiddenError('No active step found');
    }

    if (currentStep.approverId.toString() !== actorId) {
      throw new ForbiddenError('You are not the approver for this step');
    }

    const currentVersion = instance.version;

    // Find next non-skipped step
    const nextStep = instance.steps.find(
      (s) => s.stepIndex > instance.currentStepIndex && s.status === 'PENDING'
    );

    const isLastStep = !nextStep;

    const updateStepsApprove = instance.steps.map((s) => {
      const plain = (s as unknown as { toObject?: () => object }).toObject?.() ?? { ...s };
      if (s.stepIndex === instance.currentStepIndex) {
        return { ...plain, status: 'APPROVED', comment: comment ?? null, decidedAt: new Date() };
      }
      if (!isLastStep && nextStep && s.stepIndex === nextStep.stepIndex) {
        return { ...plain, status: 'ACTIVE' };
      }
      return plain;
    });

    let update: Record<string, unknown>;

    if (isLastStep) {
      update = {
        $set: {
          status: 'APPROVED',
          'workflowInstance.status': 'COMPLETED',
          'workflowInstance.steps': updateStepsApprove,
          'workflowInstance.completedAt': new Date(),
          'workflowInstance.version': currentVersion + 1,
        },
      };
    } else {
      update = {
        $set: {
          'workflowInstance.steps': updateStepsApprove,
          'workflowInstance.currentStepIndex': nextStep!.stepIndex,
          'workflowInstance.version': currentVersion + 1,
        },
      };
    }

    const updated = await this.expenseRepository.updateWithOptimisticLock(
      expense._id,
      expense.tenantId,
      currentVersion,
      update
    );

    if (!updated) {
      throw new ConflictError('Workflow was modified by another request. Please retry.');
    }

    await this.auditRepository.create({
      tenantId: expense.tenantId,
      expenseId: expense._id,
      actorId: new Types.ObjectId(actorId),
      actorName,
      action: isLastStep ? 'FULLY_APPROVED' : 'STEP_APPROVED',
      stepIndex: currentStep.stepIndex,
      comment,
    });

    return updated;
  }

  async reject(
    expense: IExpense,
    actorId: string,
    actorName: string,
    comment: string
  ): Promise<IExpense> {
    const instance = expense.workflowInstance;
    if (!instance) {
      throw new ForbiddenError('No active workflow');
    }

    const currentStep = instance.steps.find(
      (s) => s.stepIndex === instance.currentStepIndex
    );

    if (!currentStep || currentStep.status !== 'ACTIVE') {
      throw new ForbiddenError('No active step found');
    }

    if (currentStep.approverId.toString() !== actorId) {
      throw new ForbiddenError('You are not the approver for this step');
    }

    const currentVersion = instance.version;

    const updateSteps = instance.steps.map((s) => {
      const plain = (s as unknown as { toObject?: () => object }).toObject?.() ?? { ...s };
      if (s.stepIndex === instance.currentStepIndex) {
        return { ...plain, status: 'REJECTED', comment, decidedAt: new Date() };
      }
      return plain;
    });

    const update = {
      $set: {
        status: 'REJECTED',
        'workflowInstance.status': 'REJECTED',
        'workflowInstance.steps': updateSteps,
        'workflowInstance.completedAt': new Date(),
        'workflowInstance.version': currentVersion + 1,
      },
    };

    const updated = await this.expenseRepository.updateWithOptimisticLock(
      expense._id,
      expense.tenantId,
      currentVersion,
      update
    );

    if (!updated) {
      throw new ConflictError('Workflow was modified by another request. Please retry.');
    }

    await this.auditRepository.create({
      tenantId: expense.tenantId,
      expenseId: expense._id,
      actorId: new Types.ObjectId(actorId),
      actorName,
      action: 'REJECTED',
      stepIndex: currentStep.stepIndex,
      comment,
    });

    return updated;
  }

  async sendBack(
    expense: IExpense,
    actorId: string,
    actorName: string,
    comment: string
  ): Promise<IExpense> {
    const instance = expense.workflowInstance;
    if (!instance) {
      throw new ForbiddenError('No active workflow');
    }

    const currentStep = instance.steps.find(
      (s) => s.stepIndex === instance.currentStepIndex
    );

    if (!currentStep || currentStep.status !== 'ACTIVE') {
      throw new ForbiddenError('No active step found');
    }

    if (currentStep.approverId.toString() !== actorId) {
      throw new ForbiddenError('You are not the approver for this step');
    }

    const currentVersion = instance.version;

    // Archive the current workflow instance and reset expense to DRAFT
    // Spread the plain object properties (instance may be a subdoc or plain object)
    const instanceObj = (instance as unknown as { toObject?: () => object }).toObject
      ? (instance as unknown as { toObject: () => object }).toObject()
      : { ...instance };
    const archivedInstance = {
      ...instanceObj,
      status: 'RETURNED' as const,
    };

    const update = {
      $set: {
        status: 'DRAFT',
        workflowInstance: null,
      },
      $push: {
        workflowHistory: archivedInstance,
      },
    };

    const updated = await this.expenseRepository.updateWithOptimisticLock(
      expense._id,
      expense.tenantId,
      currentVersion,
      update
    );

    if (!updated) {
      throw new ConflictError('Workflow was modified by another request. Please retry.');
    }

    await this.auditRepository.create({
      tenantId: expense.tenantId,
      expenseId: expense._id,
      actorId: new Types.ObjectId(actorId),
      actorName,
      action: 'SENT_BACK',
      stepIndex: currentStep.stepIndex,
      comment,
    });

    return updated;
  }
}
