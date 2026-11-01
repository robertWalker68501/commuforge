'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '../ui/button';
import { Trash } from 'lucide-react';
import { useState, useTransition } from 'react';
import { deleteCategory } from '@/actions/categories/DeleteCategory';
import { toast } from '../ui/toast';

type CategoryDeleteButtonProps = {
  categoryId: string;
  categoryName: string;
};

const CategoryDeleteButton = ({
  categoryId,
  categoryName,
}: CategoryDeleteButtonProps) => {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteCategory(categoryId);

        if (!result.success) {
          setOpen(false);

          toast.add({
            type: 'error',
            title: result.error,
          });

          return;
        }

        toast.add({
          type: 'success',
          title: result.message,
        });

        setOpen(false);
      } catch {
        setOpen(false);

        toast.add({
          type: 'error',
          title: 'Unable to delete category. Please try again.',
        });
      }
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant='destructive'
            size='icon'
            disabled={isPending}
            aria-label={`Delete ${categoryName}`}
          />
        }
      >
        <Trash />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {categoryName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the category &quot;{categoryName}
            &quot;? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            onClick={(event) => {
              event.preventDefault();
              handleDelete();
            }}
            disabled={isPending}
          >
            {isPending ? 'Deleting...' : 'Delete Category'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CategoryDeleteButton;
