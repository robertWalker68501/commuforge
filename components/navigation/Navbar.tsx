import { Suspense } from 'react';
import { Spinner } from '../ui/spinner';
import SiteLogo from '../SiteLogo';
import { NAV_LINKS } from '@/constants';
import NavLink from './NavLink';
import MobileNav from './MobileNav';
import { ThemeToggle } from '../ui/theme-toggle';
import AuthButtons from '../auth/AuthButtons';
import { getSession } from '@/lib/auth/get-session';
import UserMenu from '../UserMenu';

const ViewNavbar = async () => {
  const session = await getSession();

  return (
    <nav className='flex items-center justify-between'>
      {/* Site logo */}
      <SiteLogo href='/' />

      {/* Desktop nav */}
      <div className='hidden items-center gap-4 md:flex'>
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.id}
            href={link.href}
            label={link.label}
          />
        ))}
        {session ? <UserMenu /> : <AuthButtons />}
        <ThemeToggle />
      </div>

      {/* Mobile nav */}
      <div className='block md:hidden'>
        <MobileNav />
      </div>
    </nav>
  );
};

const Navbar = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewNavbar />
    </Suspense>
  );
};

export default Navbar;
