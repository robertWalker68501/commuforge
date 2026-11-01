'use client';

import { moveCategory } from '@/actions/categories/MoveCategory';
import { useTransition } from 'react';
import { toast } from '../ui/toast';
import { Button } from '../ui/button';
import { ArrowDown, ArrowUp } from 'lucide-react';

type CategoryMoveButtonsProps = {
  categoryId: string;
  categoryName: string;
  isFirst: boolean;
  isLast: boolean;
};

const CategoryMoveButtons = ({
  categoryId,
  categoryName,
  isFirst,
  isLast,
}: CategoryMoveButtonsProps) => {
  const [isPending, startTransition] = useTransition();

  const handleMove = (direction: 'up' | 'down') => {
    startTransition(async () => {
      try {
        const result = await moveCategory({ id: categoryId, direction });

        if (result.success) {
          toast.add({
            type: 'success',
            title:
              'message' in result
                ? result.message
                : 'Category moved successfully.',
          });
        } else {
          toast.add({
            type: 'error',
            title: result.error ?? 'Unable to move category.',
          });
        }
      } catch {
        toast.add({
          type: 'error',
          title: 'An unexpected error occurred while moving the category.',
        });
      }
    });
  };

  return (
    <div className='flex items-center gap-2'>
      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label={`Move ${categoryName} up`}
        disabled={isFirst || isPending}
        onClick={() => handleMove('up')}
      >
        <ArrowUp />
      </Button>
      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label={`Move ${categoryName} down`}
        disabled={isLast || isPending}
        onClick={() => handleMove('down')}
      >
        <ArrowDown />
      </Button>
    </div>
  );
};

export default CategoryMoveButtons;
