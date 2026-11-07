'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { moveForumSchema } from '@/lib/schemas/ForumSchema';
import { revalidatePath } from 'next/cache';

const isTransactionConflict = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const err = error as {
    code?: string;
    cause?: unknown;
    originalCode?: string;
  };

  return (
    err.code === 'P2034' ||
    err.code === '40001' ||
    err.originalCode === '40001' ||
    (err.cause !== undefined && isTransactionConflict(err.cause))
  );
};

type MoveForumProps = {
  id: string;
  direction: 'up' | 'down';
};

export const moveForum = async ({ id, direction }: MoveForumProps) => {
  // Authorization
  await requireAdmin();

  // Validate input
  const validatedFields = moveForumSchema.safeParse({
    id,
    direction,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      error: 'Forum does not exist.',
    };
  }

  const { id: validatedId, direction: validatedDirection } =
    validatedFields.data;

  const MAX_TRIES = 3;

  // Retrieve forum and sort forum transaction
  for (let attempts = 0; attempts < MAX_TRIES; attempts++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Retrieve forum
          const forum = await tx.forum.findUnique({
            where: { id: validatedId },
            select: {
              id: true,
              categoryId: true,
              sortOrder: true,
            },
          });

          if (!forum) {
            return {
              success: false,
              error: 'Forum does not exist.',
            };
          }

          // Retrieve the Forums belonging to forum.categoryId
          const forums = await tx.forum.findMany({
            where: { categoryId: forum.categoryId },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              sortOrder: true,
            },
          });

          // Identify the Forum and its neighbor
          // currentIndex finds the selected Forum.
          const currentIndex = forums.findIndex((item) => item.id === forum.id);

          // -1 check handles an unexpected missing Forum
          if (currentIndex === -1) {
            return {
              success: false,
              error: 'Forum could not be found in its category.',
            };
          }

          // targetIndex calculates the adjacent position based on direction
          const targetIndex =
            validatedDirection === 'up' ? currentIndex - 1 : currentIndex + 1;

          // boundary check prevents moving the first Forum up or the last Forum down
          if (targetIndex < 0 || targetIndex >= forums.length) {
            return {
              success: false,
              error: 'Forum cannot be moved in that direction.',
            };
          }

          // targetForum identifies the Forum whose position we want to exchange
          const targetForum = forums[targetIndex];

          // Handle duplicate sortOrder values
          const hasDuplicateSortOrders =
            new Set(forums.map((item) => item.sortOrder)).size !==
            forums.length;

          if (!hasDuplicateSortOrders) {
            // All sortOrder values are unique.
            await tx.forum.update({
              where: { id: forum.id },
              data: { sortOrder: targetForum.sortOrder },
            });

            await tx.forum.update({
              where: { id: targetForum.id },
              data: { sortOrder: forum.sortOrder },
            });
          } else {
            // Duplicate sortOrder values exist.
            // Rearrange the array and normalize positions.
            const reorderedForums = [...forums];

            const [movedForum] = reorderedForums.splice(currentIndex, 1);

            reorderedForums.splice(targetIndex, 0, movedForum);

            for (const [index, item] of reorderedForums.entries()) {
              await tx.forum.update({
                where: { id: item.id },
                data: { sortOrder: index },
              });
            }
          }
          return {
            success: true,
            message: 'Forum reordered successfully.',
          };
        },
        { isolationLevel: 'Serializable' }
      );
      if (result?.success) {
        revalidatePath('/dashboard/forums');
        revalidatePath('/forums');
      }

      return result;
    } catch (error) {
      if (isTransactionConflict(error)) {
        if (attempts < MAX_TRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * (attempts + 1))
          );
          continue;
        }

        return {
          success: false,
          error:
            'Unable to reorder forum due to a database conflict. Please try again.',
        };
      }

      console.error('Failed to reorder forum:', error);

      return {
        success: false,
        error: 'An unexpected error occurred while reordering the forum.',
      };
    }
  }
  return {
    success: false,
    error: 'Unable to reorder forum. Please try again.',
  };
};
