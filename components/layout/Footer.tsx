import { Suspense } from 'react';
import { Spinner } from '../ui/spinner';
import Link from 'next/link';

const ViewFooter = () => {
  return (
    <footer className='border-border text-muted-foreground border-t py-4'>
      <div className='page-wrapper'>
        <p>
          Commuforge &copy; 2026 |{' '}
          <Link
            href='/'
            className='hover:text-primary'
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </footer>
  );
};

const Footer = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewFooter />
    </Suspense>
  );
};

export default Footer;
