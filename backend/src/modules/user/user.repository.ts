import { User, IUser } from './user.model';
import { Types } from 'mongoose';
import { UserRole } from '../../shared/types';

export class UserRepository {
  async findById(id: string | Types.ObjectId): Promise<IUser | null> {
    return User.findById(id).exec();
  }

  async findByEmail(tenantId: string | Types.ObjectId, email: string): Promise<IUser | null> {
    return User.findOne({ tenantId, email: email.toLowerCase() }).exec();
  }

  async findByTenant(
    tenantId: string | Types.ObjectId,
    filters: { isActive?: boolean } = {},
    page = 1,
    limit = 20
  ): Promise<{ users: IUser[]; total: number }> {
    const query: Record<string, unknown> = { tenantId, ...filters };
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query).skip(skip).limit(limit).exec(),
      User.countDocuments(query).exec(),
    ]);
    return { users, total };
  }

  async findActiveByRole(
    tenantId: string | Types.ObjectId,
    role: UserRole
  ): Promise<IUser | null> {
    return User.findOne({ tenantId, roles: role, isActive: true }).exec();
  }

  async findActiveByRoleAll(
    tenantId: string | Types.ObjectId,
    role: UserRole
  ): Promise<IUser[]> {
    return User.find({ tenantId, roles: role, isActive: true }).exec();
  }

  async create(data: Partial<IUser>): Promise<IUser> {
    const user = new User(data);
    return user.save();
  }

  async update(
    id: string | Types.ObjectId,
    data: Partial<IUser>
  ): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).exec();
  }

  async updateRoles(
    id: string | Types.ObjectId,
    roles: UserRole[]
  ): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, { $set: { roles } }, { new: true }).exec();
  }

  async setActive(
    id: string | Types.ObjectId,
    isActive: boolean
  ): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).exec();
  }
}
