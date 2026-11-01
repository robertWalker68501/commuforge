'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import { revalidatePath } from 'next/cache';
import z from 'zod';

export const deleteCategory = async (id: string) => {
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

  // Validate category exists
  const existingCategory = await prisma.category.findUnique({
    where: {
      id: validatedId.data,
    },
  });

  if (!existingCategory) {
    return {
      success: false,
      error: 'Category does not exist.',
    };
  }

  // TODO: After forum has been added to the schema.prisma
  // Prevent deletion when forums are associated with a category.

  try {
    await prisma.category.delete({
      where: {
        id: validatedId.data,
      },
    });

    revalidatePath('/dashboard/categories');

    return {
      success: true,
      message: 'Category deleted successfully.',
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return {
        success: false,
        error: 'Category no longer exists.',
      };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return {
        success: false,
        error: 'Cannot delete a category that contains forums.',
      };
    }

    throw error;
  }
};
