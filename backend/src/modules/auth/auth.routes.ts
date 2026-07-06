import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from '../user/user.repository';
import { authenticate } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { loginSchema, changePasswordSchema } from './auth.validators';

const router = Router();

const userRepository = new UserRepository();
const authService = new AuthService(userRepository);
const authController = new AuthController(authService);

// POST /auth/login - public
router.post('/login', validateBody(loginSchema), authController.login);

// POST /auth/logout - protected
router.post('/logout', authenticate, authController.logout);

// POST /auth/change-password - protected
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  authController.changePassword
);

export default router;
