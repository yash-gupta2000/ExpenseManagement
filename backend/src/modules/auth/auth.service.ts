import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../user/user.repository';
import { env } from '../../config/env';
import { UnauthorizedError, NotFoundError } from '../../shared/errors';
import { LoginInput, ChangePasswordInput } from './auth.validators';

export class AuthService {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async login(
    tenantId: string,
    input: LoginInput
  ): Promise<{ accessToken: string; user: object }> {
    const user = await this.userRepository.findByEmail(tenantId, input.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        tenantId: user.tenantId.toString(),
        roles: user.roles,
      },
      env.JWT_SECRET,
      { expiresIn: Number(env.JWT_EXPIRES_IN) }
    );

    return {
      accessToken: token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        department: user.department,
        tenantId: user.tenantId,
      },
    };
  }

  async changePassword(
    userId: string,
    tenantId: string,
    input: ChangePasswordInput
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user || user.tenantId.toString() !== tenantId) {
      throw new NotFoundError('User not found');
    }

    const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await this.userRepository.update(userId, { passwordHash });
  }
}
