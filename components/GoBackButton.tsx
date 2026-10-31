import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from './ui/button';

interface GoBackButtonProps {
  href: string;
  text: string;
  classNames?: string;
}

const GoBackButton = ({ href, text, classNames }: GoBackButtonProps) => {
  return (
    <Link
      href={href}
      className={cn(
        `${buttonVariants({ variant: 'outline' })} inline-flex w-32 max-w-full items-center gap-2`,
        classNames
      )}
    >
      <ArrowLeft size={16} />
      {text}
    </Link>
  );
};

export default GoBackButton;
