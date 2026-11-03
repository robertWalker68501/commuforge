'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import z from 'zod';
import { revalidatePath } from 'next/cache';

export const deleteForum = async (id: string) => {
  // Authorization
  await requireAdmin();

  // Validate id
  const validatedId = z.uuid().safeParse(id);

  if (!validatedId.success) {
    return {
      success: false,
      error: 'Invalid forum ID.',
    };
  }

  // Forum exists
  const existingForum = await prisma.forum.findUnique({
    where: {
      id: validatedId.data,
    },
  });

  if (!existingForum) {
    return {
      success: false,
      error: 'Forum does not exist.',
    };
  }

  // Delete forum
  try {
    await prisma.forum.delete({
      where: {
        id: validatedId.data,
      },
    });

    revalidatePath('/dashboard/forums');
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return {
        success: false,
        error: 'Forum no longer exists.',
      };
    }

    throw error;
  }

  return {
    success: true,
    message: 'Forum deleted successfully.',
  };
};
