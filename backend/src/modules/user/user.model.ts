import mongoose, { Document, Schema, Types } from 'mongoose';
import { UserRole } from '../../shared/types';

export interface IUser extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  department: string;
  managerId: Types.ObjectId | null;
  roles: UserRole[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, lowercase: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    department: { type: String, required: true },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    roles: {
      type: [String],
      enum: ['employee', 'manager', 'financeAdmin', 'orgAdmin'],
      default: ['employee'],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, roles: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
