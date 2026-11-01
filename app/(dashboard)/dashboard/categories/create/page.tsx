import CreateCategoryForm from '@/components/categories/CreateCategoryForm';
import { Spinner } from '@/components/ui/spinner';
import { requireAdmin } from '@/lib/auth/require-admin';
import { Suspense } from 'react';

const ViewCreateCategoryPage = async () => {
  await requireAdmin();

  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-3xl font-semibold'>Create Category</h1>
      <CreateCategoryForm />
    </div>
  );
};

const CreateCategoryPage = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewCreateCategoryPage />
    </Suspense>
  );
};

export default CreateCategoryPage;
