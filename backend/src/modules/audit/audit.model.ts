import mongoose, { Document, Schema, Types } from 'mongoose';
import { AuditAction } from '../../shared/types';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  expenseId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  action: AuditAction;
  stepIndex?: number;
  comment?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    action: {
      type: String,
      enum: [
        'SUBMITTED',
        'STEP_APPROVED',
        'FULLY_APPROVED',
        'REJECTED',
        'SENT_BACK',
        'WITHDRAWN',
        'MARKED_PAID',
      ],
      required: true,
    },
    stepIndex: { type: Number },
    comment: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AuditLogSchema.index({ expenseId: 1, timestamp: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
