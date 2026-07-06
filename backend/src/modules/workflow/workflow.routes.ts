import { Router } from 'express';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { CategoryRepository } from './category.repository';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateQuery } from '../../middleware/validate';
import { createCategorySchema, updateCategorySchema, listCategoriesQuerySchema } from './workflow.validators';

const router = Router();

const categoryRepository = new CategoryRepository();
const workflowService = new WorkflowService(categoryRepository);
const workflowController = new WorkflowController(workflowService);

router.use(authenticate);

// POST /expense-categories
router.post(
  '/',
  authorize('financeAdmin', 'orgAdmin'),
  validateBody(createCategorySchema),
  workflowController.createCategory
);

// GET /expense-categories
router.get(
  '/',
  validateQuery(listCategoriesQuerySchema),
  workflowController.listCategories
);

// GET /expense-categories/:id
router.get('/:id', workflowController.getCategoryById);

// PATCH /expense-categories/:id
router.patch(
  '/:id',
  authorize('financeAdmin', 'orgAdmin'),
  validateBody(updateCategorySchema),
  workflowController.updateCategory
);

// POST /expense-categories/:id/activate
router.post(
  '/:id/activate',
  authorize('financeAdmin', 'orgAdmin'),
  workflowController.activateCategory
);

// POST /expense-categories/:id/deactivate
router.post(
  '/:id/deactivate',
  authorize('financeAdmin', 'orgAdmin'),
  workflowController.deactivateCategory
);

export default router;
