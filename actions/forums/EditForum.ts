'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import { editForumSchema } from '@/lib/schemas/ForumSchema';
import z from 'zod';

type EditForumProps = z.input<typeof editForumSchema>;

type EditForumResult =
  { success: true; message: string } | { success: false; error: string };

export const editForum = async ({
  id,
  name,
  description,
  categoryId,
}: EditForumProps): Promise<EditForumResult> => {
  // Authorization
  await requireAdmin();

  // Validate fields
  const validatedFields = editForumSchema.safeParse({
    id,
    name,
    description,
    categoryId,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      error: 'Invalid fields.',
    };
  }

  const {
    id: validatedId,
    name: validatedName,
    description: validatedDescription,
    categoryId: validatedCategoryId,
  } = validatedFields.data;

  const MAX_RETRIES = 5;

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

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx): Promise<EditForumResult> => {
          // Retrieve the existing Forum
          const forum = await tx.forum.findUnique({
            where: {
              id: validatedId,
            },
          });

          if (!forum) {
            return {
              success: false,
              error: 'Forum does not exist.',
            };
          }

          // Has the forum category changed
          const categoryChanged = forum.categoryId !== validatedCategoryId;

          // Same-Category updates
          if (!categoryChanged) {
            await tx.forum.update({
              where: { id: validatedId },
              data: {
                name: validatedName,
                description: validatedDescription || null,
              },
            });

            return {
              success: true,
              message: 'Forum updated successfully.',
            };
          }

          // Moving a Forum to another Category
          // Verify the destination Category
          const existingCategory = await tx.category.findUnique({
            where: {
              id: validatedCategoryId,
            },
          });

          if (!existingCategory) {
            return {
              success: false,
              error: 'Category does not exist.',
            };
          }

          // Calculate the next sortOrder
          const lastForum = await tx.forum.findFirst({
            where: { categoryId: validatedCategoryId },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
          });

          const nextSortOrder = (lastForum?.sortOrder ?? -1) + 1;

          // Update the Forum
          await tx.forum.update({
            where: {
              id: validatedId,
            },
            data: {
              name: validatedName,
              description: validatedDescription || null,
              categoryId: validatedCategoryId,
              sortOrder: nextSortOrder,
            },
          });

          return {
            success: true,
            message: 'Forum updated successfully.',
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }

        return {
          success: false,
          error:
            'Unable to update the forum due to a conflict. Please try again.',
        };
      }

      throw error;
    }
  }
  throw new Error('Forum update retry loop exited unexpectedly.');
};
