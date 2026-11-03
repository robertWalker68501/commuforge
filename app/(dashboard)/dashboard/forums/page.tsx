import DeleteForumButton from '@/components/forums/DeleteForumButton';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireAdmin } from '@/lib/auth/require-admin';
import prisma from '@/lib/prisma';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { Fragment, Suspense } from 'react';

const ViewForumsListPage = async () => {
  await requireAdmin();

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      forums: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  });

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-3xl font-semibold'>Forums</h1>
        <Link
          href='/dashboard/forums/create'
          className={buttonVariants({ variant: 'outline' })}
        >
          Create Forum
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Forum</TableHead>
            <TableHead className='w-1/3'>Category</TableHead>
            <TableHead>
              <div className='flex justify-end'>Actions</div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className='text-muted-foreground'
              >
                No categories have been created. Create a category before adding
                a forum.
              </TableCell>
            </TableRow>
          ) : (
            categories.map((category) => (
              <Fragment key={category.id}>
                {category.forums.length === 0 ? (
                  <TableRow>
                    <TableCell className='text-muted-foreground'>
                      No forums have been created in this category.
                    </TableCell>
                    <TableCell className=''>{category.name}</TableCell>
                    <TableCell />
                  </TableRow>
                ) : (
                  category.forums.map((forum, index) => (
                    <TableRow key={forum.id}>
                      <TableCell>
                        <div className='flex flex-col gap-1'>
                          <span className='font-medium'>{forum.name}</span>
                          {forum.description && (
                            <span className='text-muted-foreground text-sm'>
                              {forum.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {index === 0 && (
                        <TableCell
                          rowSpan={category.forums.length}
                          className='align-top'
                        >
                          {category.name}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className='flex items-center justify-end gap-2'>
                          <Link
                            href={`/dashboard/forums/${forum.id}/edit`}
                            className={buttonVariants({
                              variant: 'outline',
                              size: 'icon',
                            })}
                            aria-label={`Edit ${forum.name}`}
                          >
                            <Pencil />
                          </Link>
                          <DeleteForumButton
                            id={forum.id}
                            name={forum.name}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

const ForumsListPage = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewForumsListPage />
    </Suspense>
  );
};

export default ForumsListPage;
