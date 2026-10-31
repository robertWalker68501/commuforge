import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import { ReactNode } from 'react';

const SharedLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className='flex h-dvh flex-col'>
      <Header />
      <main className='flex-1'>{children}</main>
      <Footer />
    </div>
  );
};

export default SharedLayout;
