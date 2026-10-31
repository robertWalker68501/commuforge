import Link from 'next/link';
import { buttonVariants } from '../ui/button';

const AuthButtons = () => {
  return (
    <div className='flex items-center gap-4'>
      <Link
        href='/sign-in'
        className={buttonVariants({ size: 'xs', variant: 'outline' })}
      >
        Sign In
      </Link>
      <Link
        href='/sign-up'
        className={buttonVariants({ size: 'xs' })}
      >
        Get Started
      </Link>
    </div>
  );
};

export default AuthButtons;
