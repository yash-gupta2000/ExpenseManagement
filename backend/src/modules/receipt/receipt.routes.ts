import { Router } from 'express';
import { ReceiptController } from './receipt.controller';
import { ReceiptService } from './receipt.service';
import { ExpenseRepository } from '../expense/expense.repository';
import { authenticate } from '../../middleware/authenticate';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { env } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const expenseRepository = new ExpenseRepository();
const receiptService = new ReceiptService(expenseRepository);
const receiptController = new ReceiptController(receiptService);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
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
  fileFilter: (_req, _file, cb) => {
    cb(null, true);
  },
});

router.use(authenticate);

// POST /receipts/upload
router.post('/upload', upload.single('receipt'), receiptController.upload);

export default router;
