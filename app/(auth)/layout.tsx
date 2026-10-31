import GoBackButton from '@/components/GoBackButton';
import { Spinner } from '@/components/ui/spinner';
import { getSession } from '@/lib/auth/get-session';
import { redirect } from 'next/navigation';
import { ReactNode, Suspense } from 'react';

const ViewAuthLayout = async ({ children }: { children: ReactNode }) => {
  const session = await getSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <>
      <div className='absolute top-5 left-5'>
        <GoBackButton
          href='/'
          text='Back'
        />
      </div>
      <div className='flex h-dvh flex-col items-center justify-center'>
        {children}
      </div>
    </>
  );
};

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewAuthLayout>{children}</ViewAuthLayout>
    </Suspense>
  );
};

export default AuthLayout;
