import { Router } from 'express';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateQuery } from '../../middleware/validate';
import { createUserSchema, updateUserSchema, updateRolesSchema, listUsersQuerySchema } from './user.validators';

const router = Router();

const userRepository = new UserRepository();
const userService = new UserService(userRepository);
const userController = new UserController(userService);

router.use(authenticate);

// POST /users - orgAdmin only
router.post(
  '/',
  authorize('orgAdmin'),
  validateBody(createUserSchema),
  userController.create
);

// GET /users - orgAdmin, financeAdmin
router.get(
  '/',
  authorize('orgAdmin', 'financeAdmin'),
  validateQuery(listUsersQuerySchema),
  userController.list
);

// GET /users/:id
router.get('/:id', authorize('orgAdmin', 'financeAdmin'), userController.getById);

// PATCH /users/:id
router.patch(
  '/:id',
  authorize('orgAdmin'),
  validateBody(updateUserSchema),
  userController.update
);

// PUT /users/:id/roles
router.put(
  '/:id/roles',
  authorize('orgAdmin'),
  validateBody(updateRolesSchema),
  userController.updateRoles
);

// POST /users/:id/activate
router.post('/:id/activate', authorize('orgAdmin'), userController.activate);

// POST /users/:id/deactivate
router.post('/:id/deactivate', authorize('orgAdmin'), userController.deactivate);

export default router;
