import AppSidebar from '@/components/sidebar/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ReactNode } from 'react';

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className='w-full'>
        <div>
          <SidebarTrigger />
        </div>
        <main className='p-5'>{children}</main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
