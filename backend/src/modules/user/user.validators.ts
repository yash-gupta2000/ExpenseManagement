import { z } from 'zod';

const roleEnum = z.enum(['employee', 'manager', 'financeAdmin', 'orgAdmin']);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  department: z.string().default('General'),
  managerId: z.string().optional().nullable(),
  roles: z.array(roleEnum).min(1).default(['employee']),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  managerId: z.string().nullable().optional(),
});

export const updateRolesSchema = z.object({
  roles: z.array(roleEnum).min(1),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateRolesInput = z.infer<typeof updateRolesSchema>;
