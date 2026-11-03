import EditForumForm from '@/components/forums/EditForumForm';
import { Spinner } from '@/components/ui/spinner';
import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import z from 'zod';

type EditForumPageProps = {
  params: Promise<{ id: string }>;
};

const ViewEditForumPage = async ({ params }: EditForumPageProps) => {
  // Authorization
  await requireAdmin();

  // Get params
  const { id } = await params;

  // Validate id
  const validatedID = z.uuid().safeParse(id);

  if (!validatedID.success) {
    notFound();
  }

  // Find forum
  const forum = await prisma.forum.findUnique({
    where: {
      id: validatedID.data,
    },
  });

  if (!forum) {
    notFound();
  }

  // Retrieve categories
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
    },
  });

  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-3xl font-semibold'>Edit Forum</h1>
      <EditForumForm
        id={forum.id}
        name={forum.name}
        description={forum.description}
        categoryId={forum.categoryId}
        categories={categories}
      />
    </div>
  );
};

const EditForumPage = ({ params }: EditForumPageProps) => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewEditForumPage params={params} />
    </Suspense>
  );
};

export default EditForumPage;
