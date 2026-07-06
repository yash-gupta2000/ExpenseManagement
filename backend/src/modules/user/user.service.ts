import bcrypt from 'bcryptjs';
import { UserRepository } from './user.repository';
import { IUser } from './user.model';
import { NotFoundError, ForbiddenError } from '../../shared/errors';
import { ValidationError } from '../../shared/errors';
import { CreateUserInput, UpdateUserInput } from './user.validators';
import { UserRole } from '../../shared/types';

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(tenantId: string, input: CreateUserInput): Promise<IUser> {
    const existing = await this.userRepository.findByEmail(tenantId, input.email);
    if (existing) {
      throw new ValidationError('Email already exists in this organization');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.userRepository.create({
      tenantId: tenantId as unknown as IUser['tenantId'],
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      department: input.department,
      managerId: input.managerId ? (input.managerId as unknown as IUser['managerId']) : null,
      roles: input.roles as UserRole[],
      isActive: true,
    });

    return user;
  }

  async listUsers(
    tenantId: string,
    page: number,
    limit: number,
    isActive?: boolean
  ): Promise<{ users: IUser[]; total: number }> {
    const filters: { isActive?: boolean } = {};
    if (isActive !== undefined) filters.isActive = isActive;
    return this.userRepository.findByTenant(tenantId, filters, page, limit);
  }

  async getUserById(tenantId: string, userId: string): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId.toString() !== tenantId) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async updateUser(
    tenantId: string,
    userId: string,
    input: UpdateUserInput
  ): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId.toString() !== tenantId) {
      throw new NotFoundError('User not found');
    }

    const updated = await this.userRepository.update(userId, input as Partial<IUser>);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }

  async updateRoles(
    tenantId: string,
    userId: string,
    roles: UserRole[]
  ): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId.toString() !== tenantId) {
      throw new NotFoundError('User not found');
    }

    const updated = await this.userRepository.updateRoles(userId, roles);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }

  async activateUser(tenantId: string, userId: string): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId.toString() !== tenantId) {
      throw new NotFoundError('User not found');
    }

    const updated = await this.userRepository.setActive(userId, true);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }

  async deactivateUser(tenantId: string, userId: string): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId.toString() !== tenantId) {
      throw new NotFoundError('User not found');
    }

    const updated = await this.userRepository.setActive(userId, false);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }
}
