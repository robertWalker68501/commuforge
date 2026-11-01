import { Spinner } from '@/components/ui/spinner';
import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Suspense } from 'react';

import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import CategoryDeleteButton from '@/components/categories/CategoryDeleteButton';
import CategoryMoveButtons from '@/components/categories/CategoryMoveButtons';

const ViewCategoryList = async () => {
  // Authorization
  await requireAdmin();

  // Get list of categories
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-3xl font-semibold'>Category List</h1>
        <Link
          href='/dashboard/categories/create'
          className={buttonVariants({ variant: 'outline' })}
        >
          Create New Category
        </Link>
      </div>
      {categories.length === 0 ? (
        <p>No categories have been created yet.</p>
      ) : (
        <Table>
          <TableBody>
            {categories.map((category, index) => (
              <TableRow key={category.id}>
                <TableCell>
                  <div className='flex flex-col gap-1'>
                    <span className='font-medium'>{category.name}</span>
                    {category.description && (
                      <span className='text-muted-foreground text-sm'>
                        {category.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex items-center justify-end gap-2'>
                    <CategoryMoveButtons
                      categoryId={category.id}
                      categoryName={category.name}
                      isFirst={index === 0}
                      isLast={index === categories.length - 1}
                    />
                    <Link
                      href={`/dashboard/categories/${category.id}/edit`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'icon',
                      })}
                      aria-label={`Edit ${category.name}`}
                    >
                      <Pencil />
                    </Link>
                    <CategoryDeleteButton
                      categoryId={category.id}
                      categoryName={category.name}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

const CategoryList = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewCategoryList />
    </Suspense>
  );
};

export default CategoryList;
