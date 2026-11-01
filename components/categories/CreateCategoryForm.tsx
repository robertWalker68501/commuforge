'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { createCategorySchema } from '@/lib/schemas/CategorySchema';
import { useTransition } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { FieldGroup } from '../ui/field';
import { FormFieldControl } from '../form-fields/FormFieldControl';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { createCategory } from '@/actions/categories/CreateCategory';
import { toast } from '../ui/toast';
import { useRouter } from 'next/navigation';

const CreateCategoryForm = () => {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<z.infer<typeof createCategorySchema>>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const onSubmit = (data: z.infer<typeof createCategorySchema>) => {
    startTransition(async () => {
      try {
        const result = await createCategory(data);

        if (!result.success) {
          toast.add({
            type: 'error',
            title: result.error,
          });

          return;
        }

        toast.add({
          type: 'success',
          title: 'Category created successfully.',
        });

        form.reset();
        router.push('/dashboard/categories');
      } catch (error) {
        console.error('Create category request failed:', error);

        toast.add({
          type: 'error',
          title: 'Unable to create category. Please try again.',
        });
      }
    });
  };

  return (
    <Card className='max-w-2xl'>
      <CardHeader>
        <CardTitle>Category Details</CardTitle>
        <CardDescription>
          Enter a category name and an optional description.
        </CardDescription>
      </CardHeader>
      <form
        id='create-category-form'
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <CardContent>
          <FieldGroup>
            <FormFieldControl
              control={form.control}
              name='name'
              label='Name'
              type='text'
              placeholder='Category name'
            />
            <FormFieldControl
              control={form.control}
              name='description'
              label='Description'
              type='textarea'
              placeholder='Category description'
            />
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={isPending}
                onClick={() => form.reset()}
              >
                Clear
              </Button>
              <Button
                type='submit'
                form='create-category-form'
                disabled={isPending}
              >
                {isPending ? <Spinner /> : 'Create Category'}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </form>
    </Card>
  );
};

export default CreateCategoryForm;
