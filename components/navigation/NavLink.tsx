'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { Spinner } from '../ui/spinner';

interface NavLinkProps {
  href: string;
  label: string;
  classNames?: string;
  onClick?: () => void;
  isMobile?: boolean;
}

const ViewNavLink = ({
  href,
  label,
  classNames,
  onClick,
  isMobile,
}: NavLinkProps) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'hover:text-primary text-xs font-bold uppercase transition-colors duration-300',
        isActive && 'text-primary',
        isMobile && 'text-lg',
        classNames
      )}
      onClick={onClick}
    >
      {label}
    </Link>
  );
};

const NavLink = ({
  href,
  label,
  classNames,
  onClick,
  isMobile,
}: NavLinkProps) => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewNavLink
        href={href}
        label={label}
        classNames={classNames}
        onClick={onClick}
        isMobile={isMobile}
      />
    </Suspense>
  );
};

export default NavLink;
