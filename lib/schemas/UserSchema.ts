import * as z from 'zod';

export const createUserSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(30, 'Name must not exceed 30 characters in length'),
    email: z.email(),
    password: z
      .string()
      .min(10, 'Password must be at least 10 characters in length')
      .max(128, 'Password must not exceed 128 characters in length'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const signInUserSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});
