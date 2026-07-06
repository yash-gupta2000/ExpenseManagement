import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import userRoutes from '../modules/user/user.routes';
import organizationRoutes from '../modules/organization/organization.routes';
import expenseRoutes from '../modules/expense/expense.routes';
import workflowRoutes from '../modules/workflow/workflow.routes';
import receiptRoutes from '../modules/receipt/receipt.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/organization', organizationRoutes);
router.use('/expenses', expenseRoutes);
router.use('/expense-categories', workflowRoutes);
router.use('/receipts', receiptRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.status(200).json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});

export default router;
