'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@/app/generated/prisma/client';
import { createCategorySchema } from '@/lib/schemas/CategorySchema';
import slugify from 'slugify';

type CreateCategoryProps = {
  name: string;
  description?: string;
};

type CategoryActionResult =
  { success: true; message: string } | { success: false; error: string };

export const createCategory = async ({
  name,
  description,
}: CreateCategoryProps): Promise<CategoryActionResult> => {
  // Authentication
  await requireAdmin();

  // Validate input
  const validatedFields = createCategorySchema.safeParse({
    name,
    description,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      error: 'Invalid input.',
    };
  }

  const { name: validatedName, description: validatedDescription } =
    validatedFields.data;

  // Create slug
  const slug = slugify(validatedName, {
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

  try {
    const existingCategory = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingCategory) {
      return {
        success: false,
        error: 'A category with this name or URL slug already exists.',
      };
    }

    // Calculate Category Ordering
    const categoryOrderResult = await prisma.category.aggregate({
      _max: {
        sortOrder: true,
      },
    });

    const nextSortOrder = (categoryOrderResult._max.sortOrder ?? -1) + 1;

    // Save the Category to PostgreSQL
    await prisma.category.create({
      data: {
        name: validatedName,
        description: validatedDescription || null,
        slug,
        sortOrder: nextSortOrder,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return {
        success: false,
        error: 'A category with this name or URL slug already exists.',
      };
    }

    console.error('Failed to create category:', error);

    return {
      success: false,
      error: 'An unexpected error occurred while creating the category.',
    };
  }

  return {
    success: true,
    message: 'Category created successfully.',
  };
};
