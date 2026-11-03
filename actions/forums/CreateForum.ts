'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import { createForumSchema } from '@/lib/schemas/ForumSchema';
import { revalidatePath } from 'next/cache';
import slugify from 'slugify';

type CreateForumProps = {
  categoryId: string;
  name: string;
  description?: string;
};

type CreateForumResult =
  { success: true; message: string } | { success: false; error: string };

const MAX_RETRIES = 3;

const isTransactionConflict = (error: unknown): boolean => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  ) {
    return true;
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const cause = 'cause' in error ? error.cause : undefined;

  if (typeof cause !== 'object' || cause === null) {
    return false;
  }

  return 'originalCode' in cause && cause.originalCode === '40001';
};

export const createForum = async ({
  categoryId,
  name,
  description,
}: CreateForumProps): Promise<CreateForumResult> => {
  // Always authorize on the server, regardless of page-level protection.
  await requireAdmin();

  const validatedFields = createForumSchema.safeParse({
    categoryId,
    name,
    description,
  });

  if (!validatedFields.success) {
    return { success: false, error: 'Invalid input data.' };
  }

  const {
    categoryId: validatedCategoryId,
    name: validatedName,
    description: validatedDescription,
  } = validatedFields.data;

  const slug = slugify(validatedName, {
    lower: true,
    strict: true,
    trim: true,
  });

  if (!slug) {
    return {
      success: false,
      error: 'Forum name must contain letters or numbers.',
    };
  }

  // A friendly existence check; the foreign key remains the final safeguard.
  const existingCategory = await prisma.category.findUnique({
    where: { id: validatedCategoryId },
    select: { id: true },
  });

  if (!existingCategory) {
    return { success: false, error: 'Category does not exist.' };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Recompute the next position on every retry, in the same transaction
      // as the insert. Serializable isolation detects conflicting writers.
      await prisma.$transaction(
        async (tx) => {
          const result = await tx.forum.aggregate({
            where: { categoryId: validatedCategoryId },
            _max: { sortOrder: true },
          });

          const sortOrder = (result._max.sortOrder ?? -1) + 1;

          await tx.forum.create({
            data: {
              name: validatedName,
              description: validatedDescription || null,
              categoryId: validatedCategoryId,
              slug,
              sortOrder,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      // Only revalidate after the transaction has committed successfully.
      revalidatePath('/dashboard/forums');
      revalidatePath('/forums');

      return { success: true, message: 'Forum created successfully.' };
    } catch (error) {
      if (isTransactionConflict(error)) {
        if (attempt < MAX_RETRIES - 1) continue;
        return {
          success: false,
          error:
            'The forum could not be created due to concurrent changes. Please try again.',
        };
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return {
            success: false,
            error: 'A forum with this name or URL slug already exists.',
          };
        }

        if (error.code === 'P2003') {
          return {
            success: false,
            error: 'The selected category no longer exists.',
          };
        }
      }

      console.error('Failed to create forum:', error);
      return {
        success: false,
        error: 'An unexpected error occurred while creating the forum.',
      };
    }
  }

  // Unreachable in normal operation; keeps the return contract explicit.
  return { success: false, error: 'Unable to create forum. Please try again.' };
};
