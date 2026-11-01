'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import z from 'zod';
import { revalidatePath } from 'next/cache';

type MoveCategoryProps = {
  id: string;
  direction: 'up' | 'down';
};

export const moveCategory = async ({ id, direction }: MoveCategoryProps) => {
  // Authorization
  await requireAdmin();

  // Validate id
  const validatedId = z.uuid().safeParse(id);

  if (!validatedId.success) {
    return {
      success: false,
      error: 'Invalid category ID.',
    };
  }

  // Validate direction
  const validatedDirection = z.enum(['up', 'down']).safeParse(direction);

  if (!validatedDirection.success) {
    return {
      success: false,
      error: 'Invalid category direction.',
    };
  }

  // Serializable transactions may conflict when multiple admins reorder at once.
  // Retry those conflicts a limited number of times using a fresh database read.
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const categories = await tx.category.findMany({
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { id: true, sortOrder: true },
          });

          const currentIndex = categories.findIndex(
            (category) => category.id === validatedId.data
          );

          if (currentIndex === -1) {
            return {
              success: false,
              error: 'Category does not exist.',
            };
          }

          const targetIndex =
            validatedDirection.data === 'up'
              ? currentIndex - 1
              : currentIndex + 1;

          if (targetIndex < 0 || targetIndex >= categories.length) {
            return {
              success: false,
              error: 'Category cannot be moved in that direction.',
            };
          }

          // Swap only the neighboring categories, preserving existing gaps.
          const currentCategory = categories[currentIndex];
          const targetCategory = categories[targetIndex];

          await tx.category.update({
            where: { id: currentCategory.id },
            data: { sortOrder: targetCategory.sortOrder },
          });

          await tx.category.update({
            where: { id: targetCategory.id },
            data: { sortOrder: currentCategory.sortOrder },
          });

          return { success: true, message: 'Category moved successfully.' };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      if (result.success) {
        revalidatePath('/dashboard/categories');
      }

      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        if (attempt < maxAttempts) continue;
        return {
          success: false,
          error:
            'The category order changed while you were updating it. Please try again.',
        };
      }

      throw error;
    }
  }

  return {
    success: false,
    error: 'Unable to reorder categories. Please try again.',
  };
};
