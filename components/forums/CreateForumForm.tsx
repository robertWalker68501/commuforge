'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { createForumSchema } from '@/lib/schemas/ForumSchema';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createForum } from '@/actions/forums/CreateForum';
import { toast } from '../ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { FieldGroup } from '../ui/field';
import { FormFieldControl } from '../form-fields/FormFieldControl';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

type CreateForumFormProps = {
  categories: {
    id: string;
    name: string;
  }[];
};

const CreateForumForm = ({ categories }: CreateForumFormProps) => {
  const [isPending, startTransaction] = useTransition();
  const router = useRouter();

  const form = useForm<z.infer<typeof createForumSchema>>({
    resolver: zodResolver(createForumSchema),
    defaultValues: {
      name: '',
      description: '',
      categoryId: '',
    },
  });

  const onSubmit = (data: z.infer<typeof createForumSchema>) => {
    startTransaction(async () => {
      const result = await createForum(data);

      if (result.success) {
        toast.add({
          type: 'success',
          title: result.message,
        });
        form.reset();
        router.push('/dashboard/forums');
      } else {
        toast.add({
          type: 'error',
          title: result.error,
        });
      }
    });
  };

  return (
    <Card className='max-w-3xl'>
      <CardHeader>
        <CardTitle>Create New Forum</CardTitle>
      </CardHeader>
      <form
        id='create-forum-form'
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <CardContent>
          <FieldGroup>
            <FormFieldControl
              control={form.control}
              name='name'
              label='Name'
              type='text'
              placeholder='Forum Name'
            />
            <FormFieldControl
              control={form.control}
              name='categoryId'
              label='Category'
              type='select'
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              placeholder='Select Category'
            />
            <FormFieldControl
              control={form.control}
              name='description'
              label='Description'
              type='textarea'
              placeholder='Forum description'
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
                form='create-forum-form'
                disabled={isPending || categories.length === 0}
              >
                {isPending ? <Spinner /> : 'Create Forum'}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </form>
    </Card>
  );
};

export default CreateForumForm;
