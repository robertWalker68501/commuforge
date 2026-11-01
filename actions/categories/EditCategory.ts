'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import { editCategorySchema } from '@/lib/schemas/CategorySchema';
import slugify from 'slugify';

type EditCategoryProps = {
  id: string;
  name: string;
  description?: string;
};

type CategoryActionResult =
  { success: true; message: string } | { success: false; error: string };

export const editCategory = async ({
  id,
  name,
  description,
}: EditCategoryProps): Promise<CategoryActionResult> => {
  // Authorization
  await requireAdmin();

  // Validate input
  const validatedFields = editCategorySchema.safeParse({
    id,
    name,
    description,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      error: 'Invalid input',
    };
  }

  const {
    id: validatedId,
    name: validatedName,
    description: validatedDescription,
  } = validatedFields.data;

  try {
    // Retrieve the existing category
    const existingCategory = await prisma.category.findUnique({
      where: {
        id: validatedId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!existingCategory) {
      return {
        success: false,
        error: 'Category does not exist.',
      };
    }

    // Slug regeneration
    let slug = existingCategory.slug;

    const nameChanged = validatedName !== existingCategory.name;

    if (nameChanged) {
      slug = slugify(validatedName, {
        lower: true,
        strict: true,
        trim: true,
      });

      if (!slug) {
        return {
          success: false,
          error: 'Category name must contain letters or numbers.',
        };
      }

      if (slug !== existingCategory.slug) {
        // Check whether another category already uses this slug.
        const existingSlug = await prisma.category.findUnique({
          where: {
            slug,
          },
          select: {
            id: true,
          },
        });

        if (existingSlug) {
          return {
            success: false,
            error: 'A category with this name or URL slug already exists.',
          };
        }
      }
    }

    await prisma.category.update({
      where: {
        id: validatedId,
      },
      data: {
        name: validatedName,
        description: validatedDescription || null,
        slug,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'A category with this name or URL slug already exists.',
        };
      }

      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Category does not exist.',
        };
      }
    }

    console.error('Failed to update category:', error);

    return {
      success: false,
      error: 'An unexpected error occurred while updating the category.',
    };
  }

  return {
    success: true,
    message: 'Category updated successfully.',
  };
};
