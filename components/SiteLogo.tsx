'use client';

import { cn } from 'cn';
import Image from 'next/image';
import Link from 'next/link';

interface SiteLogoProps {
  href: string;
  classNames?: string;
  onClick?: () => void;
  imgSrc?: string;
  imgAlt?: string;
  imgHeight?: number;
  imgWidth?: number;
  text?: string;
}

const SiteLogo = ({
  href,
  classNames,
  onClick,
  imgSrc = '/assets/images/logo-light.png',
  imgAlt = 'Commuforge Logo',
  imgHeight = 30,
  imgWidth = 27,
  text = 'Commuforge',
}: SiteLogoProps) => {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 text-xl font-semibold',
        classNames
      )}
      onClick={onClick}
    >
      <Image
        src={imgSrc}
        alt={imgAlt}
        height={imgHeight}
        width={imgWidth}
      />
      {text}
    </Link>
  );
};

export default SiteLogo;
