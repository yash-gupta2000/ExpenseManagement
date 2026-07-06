import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amountThreshold: z.number().nonnegative('Threshold must be non-negative').transform(Math.round),
  cfoId: z.string().optional().nullable(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  amountThreshold: z.number().nonnegative().transform(Math.round).optional(),
  cfoId: z.string().optional().nullable(),
});

export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isActive: z.coerce.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
