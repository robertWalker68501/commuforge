'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { editCategorySchema } from '@/lib/schemas/CategorySchema';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { editCategory } from '@/actions/categories/EditCategory';
import { toast } from '../ui/toast';

type EditCategoryFormProps = {
  category: {
    id: string;
    name: string;
    description: string | null;
  };
};

const EditCategoryForm = ({ category }: EditCategoryFormProps) => {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<z.infer<typeof editCategorySchema>>({
    resolver: zodResolver(editCategorySchema),
    defaultValues: {
      id: category.id,
      name: category.name,
      description: category.description ?? '',
    },
  });

  const onSubmit = (data: z.infer<typeof editCategorySchema>) => {
    startTransition(async () => {
      try {
        const result = await editCategory(data);

        if (!result.success) {
          toast.add({
            type: 'error',
            title: result.error,
          });

          return;
        }

        toast.add({
          type: 'success',
          title: 'Category updated successfully',
        });

        router.push('/dashboard/categories');
      } catch (error) {
        console.error('Failed to update category:', error);

        toast.add({
          type: 'error',
          title: 'Failed to update category.',
        });
      }
    });
  };

  return (
    <Card className='max-w-2xl'>
      <CardHeader>
        <CardTitle>Edit Category</CardTitle>
        <CardDescription>
          Update the category name and description.
        </CardDescription>
      </CardHeader>
      <form
        id='edit-category-form'
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <CardContent>
          <FieldGroup>
            <FormFieldControl
              control={form.control}
              name='name'
              label='Name'
              type='text'
            />
            <FormFieldControl
              control={form.control}
              name='description'
              label='Description'
              type='textarea'
            />
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={isPending}
                onClick={() => form.reset()}
              >
                Reset
              </Button>
              <Button
                type='submit'
                form='edit-category-form'
                disabled={isPending}
              >
                {isPending ? <Spinner /> : 'Update Category'}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </form>
    </Card>
  );
};

export default EditCategoryForm;
