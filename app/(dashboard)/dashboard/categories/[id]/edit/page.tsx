import EditCategoryForm from '@/components/categories/EditCategoryForm';
import { Spinner } from '@/components/ui/spinner';
import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import z from 'zod';

type EditCategoryPageProps = {
  params: Promise<{ id: string }>;
};

const ViewEditCategoryPage = async ({ params }: EditCategoryPageProps) => {
  // Authorization
  await requireAdmin();

  // Get params
  const { id } = await params;

  // Validate id
  const validatedCategoryId = z.uuid().safeParse(id);

  if (!validatedCategoryId.success) {
    notFound();
  }
  // Retrieve category from database
  const category = await prisma.category.findUnique({
    where: {
      id: validatedCategoryId.data,
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  if (!category) {
    notFound();
  }

  return (
    <div>
      <EditCategoryForm category={category} />
    </div>
  );
};

const EditCategoryPage = ({ params }: EditCategoryPageProps) => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewEditCategoryPage params={params} />
    </Suspense>
  );
};

export default EditCategoryPage;
