'use client';

import * as React from 'react';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import {
  XIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

const toastTypeStyles: Record<ToastType, string> = {
  success:
    'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-600',
  error:
    'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-600',
  warning:
    'border-orange-500 bg-orange-500 text-white dark:border-orange-400 dark:bg-orange-500',
  info:
    'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600',
  loading:
    'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600',
};

function getToastTypeClass(type: string | undefined) {
  return type && type in toastTypeStyles
    ? toastTypeStyles[type as ToastType]
    : undefined;
}

const toast = ToastPrimitive.createToastManager();

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return (
    <ToastPrimitive.Portal
      data-slot='toast-portal'
      {...props}
    />
  );
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot='toast-viewport'
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full',
        className
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot='toast'
      className={cn(
        'group/toast bg-popover text-popover-foreground focus-visible:border-ring focus-visible:ring-ring/50 pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-2xl border shadow-lg will-change-transform outline-none select-none focus-visible:ring-[3px]',
        '[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]',
        'h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]',
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
        'data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]',
        '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]',
        'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        className
      )}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot='toast-content'
      className={cn(
        'flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100',
        className
      )}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot='toast-title'
      className={cn('text-sm font-medium', className)}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot='toast-description'
      className={cn(
        'text-muted-foreground text-sm group-data-[type=success]/toast:text-white/85 group-data-[type=error]/toast:text-white/85 group-data-[type=warning]/toast:text-white/85 group-data-[type=info]/toast:text-white/85 group-data-[type=loading]/toast:text-white/85',
        className
      )}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = (
    <Button
      variant='outline'
      size='sm'
    />
  ),
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot='toast-action'
      render={render}
      className={cn(
        'shrink-0 group-data-[type=success]/toast:border-white/30 group-data-[type=success]/toast:bg-white/10 group-data-[type=success]/toast:text-white group-data-[type=success]/toast:hover:bg-white/20 group-data-[type=error]/toast:border-white/30 group-data-[type=error]/toast:bg-white/10 group-data-[type=error]/toast:text-white group-data-[type=error]/toast:hover:bg-white/20 group-data-[type=warning]/toast:border-white/30 group-data-[type=warning]/toast:bg-white/10 group-data-[type=warning]/toast:text-white group-data-[type=warning]/toast:hover:bg-white/20 group-data-[type=info]/toast:border-white/30 group-data-[type=info]/toast:bg-white/10 group-data-[type=info]/toast:text-white group-data-[type=info]/toast:hover:bg-white/20 group-data-[type=loading]/toast:border-white/30 group-data-[type=loading]/toast:bg-white/10 group-data-[type=loading]/toast:text-white group-data-[type=loading]/toast:hover:bg-white/20',
        className
      )}
      {...props}
    />
  );
}

function ToastClose({
  className,
  children,
  render = (
    <Button
      variant='ghost'
      size='icon-sm'
    />
  ),
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot='toast-close'
      aria-label='Close toast'
      render={render}
      className={cn(
        "text-muted-foreground hover:text-foreground relative shrink-0 after:absolute after:-inset-2 after:content-[''] group-data-[type=success]/toast:text-white/80 group-data-[type=success]/toast:hover:bg-white/20 group-data-[type=success]/toast:hover:text-white group-data-[type=error]/toast:text-white/80 group-data-[type=error]/toast:hover:bg-white/20 group-data-[type=error]/toast:hover:text-white group-data-[type=warning]/toast:text-white/80 group-data-[type=warning]/toast:hover:bg-white/20 group-data-[type=warning]/toast:hover:text-white group-data-[type=info]/toast:text-white/80 group-data-[type=info]/toast:hover:bg-white/20 group-data-[type=info]/toast:hover:text-white group-data-[type=loading]/toast:text-white/80 group-data-[type=loading]/toast:hover:bg-white/20 group-data-[type=loading]/toast:hover:text-white",
        className
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden='true' />}
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null;

  if (type === 'success') {
    icon = <CircleCheckIcon aria-hidden='true' />;
  }

  if (type === 'info') {
    icon = <InfoIcon aria-hidden='true' />;
  }

  if (type === 'warning') {
    icon = <TriangleAlertIcon aria-hidden='true' />;
  }

  if (type === 'error') {
    icon = (
      <OctagonXIcon
        aria-hidden='true'
      />
    );
  }

  if (type === 'loading') {
    icon = (
      <Loader2Icon
        className='animate-spin'
        aria-hidden='true'
      />
    );
  }

  if (!icon) {
    return null;
  }

  return (
    <span
      data-slot='toast-icon'
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast
      key={toastItem.id}
      toast={toastItem}
      data-type={toastItem.type}
      className={getToastTypeClass(toastItem.type)}
    >
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function Toaster({
  children,
  toastManager = toast,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider
      toastManager={toastManager}
      {...props}
    >
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

const createToastManager = ToastPrimitive.createToastManager;
const useToastManager = ToastPrimitive.useToastManager;

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  useToastManager,
};
