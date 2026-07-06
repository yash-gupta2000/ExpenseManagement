import mongoose, { Document, Schema, Types } from 'mongoose';
import { ExpenseStatus, WorkflowStatus, StepStatus, ChainType } from '../../shared/types';

export interface IWorkflowStep {
  stepIndex: number;
  approverId: Types.ObjectId;
  approverName: string;
  status: StepStatus;
  comment?: string;
  decidedAt?: Date;
}

export interface IWorkflowInstance {
  categoryId: Types.ObjectId;
  chainType: ChainType;
  version: number;
  status: WorkflowStatus;
  steps: IWorkflowStep[];
  currentStepIndex: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface IExpense extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  submittedBy: Types.ObjectId;
  title: string;
  amount: number;
  currency: string;
  date: Date;
  categoryId: Types.ObjectId;
  categoryName: string;
  description?: string;
  receiptPath?: string;
  status: ExpenseStatus;
  workflowInstance: IWorkflowInstance | null;
  workflowHistory: IWorkflowInstance[];
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStepSchema = new Schema<IWorkflowStep>(
  {
    stepIndex: { type: Number, required: true },
    approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approverName: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'SKIPPED'],
      default: 'PENDING',
    },
    comment: { type: String },
    decidedAt: { type: Date },
  },
  { _id: false }
);

const WorkflowInstanceSchema = new Schema<IWorkflowInstance>(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    chainType: { type: String, enum: ['STANDARD', 'ELEVATED'], required: true },
    version: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'REJECTED', 'RETURNED'],
      default: 'ACTIVE',
    },
    steps: { type: [WorkflowStepSchema], default: [] },
    currentStepIndex: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: false }
);

const ExpenseSchema = new Schema<IExpense>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' },
    date: { type: Date, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    categoryName: { type: String, required: true },
    description: { type: String },
    receiptPath: { type: String },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAID'],
      default: 'DRAFT',
    },
    workflowInstance: { type: WorkflowInstanceSchema, default: null },
    workflowHistory: { type: [WorkflowInstanceSchema], default: [] },
  },
  { timestamps: true }
);

ExpenseSchema.index({ tenantId: 1, submittedBy: 1, status: 1 });
ExpenseSchema.index({ tenantId: 1, status: 1 });
ExpenseSchema.index({ 'workflowInstance.steps.approverId': 1, 'workflowInstance.steps.status': 1 });

export const Expense = mongoose.model<IExpense>('Expense', ExpenseSchema);
