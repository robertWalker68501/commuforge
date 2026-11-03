import * as z from 'zod';

export const createForumSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),
  categoryId: z.uuid('Please select a category.'),
});

export const editForumSchema = createForumSchema.extend({
  id: z.uuid(),
});
