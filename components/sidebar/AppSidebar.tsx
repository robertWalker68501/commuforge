import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import SiteLogo from '../SiteLogo';
import Link from 'next/link';
import {
  FolderPlus,
  FolderTree,
  LayoutDashboard,
  MessageSquarePlus,
  MessagesSquare,
} from 'lucide-react';
import { Suspense } from 'react';
import { Spinner } from '../ui/spinner';
import { requireAuth } from '@/lib/auth/require-auth';

const ViewAppSidebar = async () => {
  const session = await requireAuth();

  const isAdmin =
    session.user.role === 'admin' || session.user.role === 'owner';

  return (
    <Sidebar>
      <SidebarHeader className='border-border mb-5 border-b'>
        <SiteLogo href='/' />
      </SidebarHeader>
      <SidebarContent>
        {/* User Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href='/dashboard' />}>
                  <LayoutDashboard />
                  Dashboard
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Admin Menu */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href='/dashboard/categories' />}
                  >
                    <FolderTree />
                    Categories
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href='/dashboard/categories/create' />}
                  >
                    <FolderPlus />
                    Add Category
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton render={<Link href='/dashboard/forums' />}>
                    <MessagesSquare />
                    Forums
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href='/dashboard/forums/create' />}
                  >
                    <MessageSquarePlus />
                    Add Forum
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
};

const AppSidebar = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewAppSidebar />
    </Suspense>
  );
};

export default AppSidebar;
