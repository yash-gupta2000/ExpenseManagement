import { Response, NextFunction } from 'express';
import * as path from 'path';
import { ReceiptService } from './receipt.service';
import { AuthenticatedRequest } from '../../shared/types';
import { ValidationError } from '../../shared/errors';

export class ReceiptController {
  constructor(private receiptService: ReceiptService) {}

  upload = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      const filePath = this.receiptService.buildFilePath(
        req.context.tenantId,
        req.file.filename
      );

      res.status(200).json({
        data: {
          filePath,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  download = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const filePath = await this.receiptService.getReceiptForExpense(
        req.context.tenantId,
        req.params.id
      );

      res.download(filePath, path.basename(filePath));
    } catch (error) {
      next(error);
    }
  };
}
