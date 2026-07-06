import { Router } from 'express';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';
import { ExpenseRepository } from './expense.repository';
import { CategoryRepository } from '../workflow/category.repository';
import { UserRepository } from '../user/user.repository';
import { AuditRepository } from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { ReceiptService } from '../receipt/receipt.service';
import { ReceiptController } from '../receipt/receipt.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateQuery } from '../../middleware/validate';
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  workflowActionSchema,
  workflowRejectSchema,
  workflowSendBackSchema,
} from './expense.validators';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { env } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const expenseRepository = new ExpenseRepository();
const categoryRepository = new CategoryRepository();
const userRepository = new UserRepository();
const auditRepository = new AuditRepository();
const auditService = new AuditService(auditRepository);
const receiptService = new ReceiptService(expenseRepository);

const expenseService = new ExpenseService(
  expenseRepository,
  categoryRepository,
  userRepository,
  auditRepository
);

const expenseController = new ExpenseController(expenseService, auditService);
const receiptController = new ReceiptController(receiptService);

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // req.context is set by authenticate middleware
    const authenticatedReq = req as typeof req & { context: { tenantId: string } };
    const tenantId = authenticatedReq.context?.tenantId || 'default';
    const dir = path.join(env.UPLOAD_DIR, tenantId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF are allowed.'));
    }
  },
});

router.use(authenticate);

// POST /expenses
router.post('/', validateBody(createExpenseSchema), expenseController.create);

// GET /expenses
router.get('/', validateQuery(listExpensesQuerySchema), expenseController.list);

// GET /expenses/:id
router.get('/:id', expenseController.getById);

// PATCH /expenses/:id
router.patch('/:id', validateBody(updateExpenseSchema), expenseController.update);

// POST /expenses/:id/submit
router.post('/:id/submit', expenseController.submit);

// POST /expenses/:id/withdraw
router.post('/:id/withdraw', expenseController.withdraw);

// POST /expenses/:id/mark-paid - financeAdmin only
router.post('/:id/mark-paid', authorize('financeAdmin'), expenseController.markPaid);

// POST /expenses/:id/workflow/approve
router.post(
  '/:id/workflow/approve',
  validateBody(workflowActionSchema),
  expenseController.approve
);

// POST /expenses/:id/workflow/reject
router.post(
  '/:id/workflow/reject',
  validateBody(workflowRejectSchema),
  expenseController.reject
);

// POST /expenses/:id/workflow/send-back
router.post(
  '/:id/workflow/send-back',
  validateBody(workflowSendBackSchema),
  expenseController.sendBack
);

// GET /expenses/:id/audit-log
router.get('/:id/audit', expenseController.getAuditLog);
router.get('/:id/audit-log', expenseController.getAuditLog);

// GET /expenses/:id/receipt
router.get('/:id/receipt', receiptController.download);

export { upload };
export default router;
