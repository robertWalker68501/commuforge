import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import prisma from '@/lib/prisma';

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';

const ViewForumListPage = async () => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      forums: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
    },
  });

  return (
    <div className='page-wrapper my-5'>
      <div className='flex flex-col gap-4'>
        <h1 className='text-3xl font-semibold'>Forum List</h1>
        {categories.length === 0 ? (
          <p>There are no community forums available yet.</p>
        ) : (
          categories.map((category) => (
            <Card key={category.id}>
              <CardHeader>
                <CardTitle>{category.name}</CardTitle>
                {category.description && (
                  <CardDescription>{category.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className='flex flex-col gap-2'>
                {category.forums.length === 0 ? (
                  <span>No forums have been created in this category yet.</span>
                ) : (
                  category.forums.map((forum) => (
                    <Item
                      key={forum.id}
                      variant='outline'
                    >
                      <ItemContent>
                        <ItemTitle>{forum.name}</ItemTitle>
                        {forum.description && (
                          <ItemDescription>{forum.description}</ItemDescription>
                        )}
                      </ItemContent>
                    </Item>
                  ))
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

const ForumListPage = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewForumListPage />
    </Suspense>
  );
};

export default ForumListPage;
