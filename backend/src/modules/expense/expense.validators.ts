import { z } from 'zod';

export const createExpenseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  amount: z.number().positive('Amount must be positive').transform((v) => Math.round(v)),
  currency: z.string().default('USD'),
  date: z.string().or(z.date()).transform((v) => new Date(v)),
  categoryId: z.string().min(1, 'Category ID is required'),
  description: z.string().optional().default(''),
  receiptPath: z.string().optional(),
});

export const updateExpenseSchema = z.object({
  title: z.string().min(1).optional(),
  amount: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  date: z
    .string()
    .or(z.date())
    .transform((v) => new Date(v))
    .optional(),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  receiptPath: z.string().optional(),
});

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAID'])
    .optional(),
});

export const workflowActionSchema = z.object({
  comment: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
});

export const workflowRejectSchema = z.object({
  comment: z.string().min(1, 'Comment is required for rejection'),
  version: z.number().int().nonnegative().optional(),
});

export const workflowSendBackSchema = z.object({
  comment: z.string().min(1, 'Comment is required for send-back'),
  version: z.number().int().nonnegative().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
