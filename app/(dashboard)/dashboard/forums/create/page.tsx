import CreateForumForm from '@/components/forums/CreateForumForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import Link from 'next/link';
import { Suspense } from 'react';

const AuthorizedCreateForumPage = async () => {
  await requireAdmin();

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
    },
  });

  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-3xl font-semibold'>Create Forum</h1>

      {categories.length === 0 ? (
        <Card className='max-w-3xl'>
          <CardHeader>
            <CardTitle>No Categories Available</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-muted-foreground'>
              You need to create a category before you can create a forum.
            </p>
            <Link
              href='/dashboard/categories/create'
              className='bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium'
            >
              Create Category
            </Link>
          </CardContent>
        </Card>
      ) : (
        <CreateForumForm categories={categories} />
      )}
    </div>
  );
};

const CreateForumPage = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner className='h-10 w-10' />
        </div>
      }
    >
      <AuthorizedCreateForumPage />
    </Suspense>
  );
};

export default CreateForumPage;
