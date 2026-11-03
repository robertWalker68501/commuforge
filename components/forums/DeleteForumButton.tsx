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
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { deleteForum } from '@/actions/forums/DeleteForum';
import { toast } from '@/components/ui/toast';
import { Trash } from 'lucide-react';

type DeleteForumButtonProps = {
  id: string;
  name: string;
};

const DeleteForumButton = ({ id, name }: DeleteForumButtonProps) => {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteForum(id);

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
          title: 'Unable to delete forum. Please try again.',
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
            aria-label={`Delete ${name}`}
          />
        }
      >
        <Trash />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the forum &quot;{name}
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
            {isPending ? 'Deleting...' : 'Delete Forum'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteForumButton;
