'use client';

import { moveForum } from '@/actions/forums/MoveForum';
import { useTransition } from 'react';
import { toast } from '../ui/toast';
import { Button } from '../ui/button';
import { ArrowDown, ArrowUp } from 'lucide-react';

type ForumMoveButtonsProps = {
  forumId: string;
  forumName: string;
  isFirst: boolean;
  isLast: boolean;
};

const ForumMoveButtons = ({
  forumId,
  forumName,
  isFirst,
  isLast,
}: ForumMoveButtonsProps) => {
  const [isPending, startTransition] = useTransition();

  const handleMove = (direction: 'up' | 'down') => {
    console.log('Button clicked:', forumId, direction);

    startTransition(async () => {
      console.log('Starting Server Action...');

      try {
        const result = await moveForum({ id: forumId, direction });

        console.log('Server Action result:', result);

        if (result.success) {
          toast.add({
            type: 'success',
            title:
              'message' in result
                ? result.message
                : 'Forum moved successfully.',
          });
        } else {
          toast.add({
            type: 'error',
            title: result.error ?? 'Unable to move forum.',
          });
        }
      } catch (error) {
        console.error('Server Action failed:', error);

        toast.add({
          type: 'error',
          title: 'An unexpected error occurred while moving the forum.',
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
        aria-label={`Move ${forumName} up`}
        disabled={isFirst || isPending}
        onClick={() => handleMove('up')}
      >
        <ArrowUp aria-hidden='true' />
      </Button>

      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label={`Move ${forumName} down`}
        disabled={isLast || isPending}
        onClick={() => handleMove('down')}
      >
        <ArrowDown aria-hidden='true' />
      </Button>
    </div>
  );
};

export default ForumMoveButtons;
