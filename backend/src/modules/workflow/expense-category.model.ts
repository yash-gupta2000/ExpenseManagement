import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IExpenseCategory extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  isActive: boolean;
  // Amount in cents. Expenses above this use the elevated chain (org tree + Finance Admin + CFO).
  amountThreshold: number;
  // Optional: specific user to act as CFO for elevated approvals.
  // If null, falls back to first active orgAdmin.
  cfoId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseCategorySchema = new Schema<IExpenseCategory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    amountThreshold: { type: Number, required: true, default: 0 },
    cfoId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

ExpenseCategorySchema.index({ tenantId: 1 });

export const ExpenseCategory = mongoose.model<IExpenseCategory>(
  'ExpenseCategory',
  ExpenseCategorySchema
);
