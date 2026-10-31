'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, Inbox, MailCheck, RefreshCw } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ValidateEmailPage = () => {
  const [email, setEmail] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hasRequested, setHasRequested] = useState(false);

  const handleResend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || isPending || hasRequested) {
      return;
    }

    setMessage('');
    setError('');

    startTransition(async () => {
      try {
        const { error: resendError } = await authClient.sendVerificationEmail({
          email: normalizedEmail,
          callbackURL: '/sign-in',
        });

        if (resendError) {
          setError('Unable to process your request. Please try again later.');
          return;
        }

        setMessage(
          'If this email address has an account awaiting verification, a verification email will be sent. Please check your inbox.'
        );

        setHasRequested(true);
      } catch {
        setError('Something went wrong. Please try again later.');
      }
    });
  };

  return (
    <div className='w-full max-w-md px-4'>
      <Card className='gap-6'>
        <CardHeader className='items-center text-center'>
          <div className='bg-primary/10 text-primary mb-4 flex size-16 items-center justify-center rounded-full'>
            <MailCheck className='size-8' />
          </div>

          <CardTitle className='text-2xl'>Check your email</CardTitle>

          <CardDescription className='text-base'>
            You&apos;re one step away from joining the community.
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-6'>
          <p className='text-muted-foreground text-center text-sm leading-relaxed'>
            If your registration was successful, you&apos;ll receive an email
            containing a link to verify your account. Click the link to complete
            your registration.
          </p>

          <div className='bg-muted/50 flex items-start gap-3 rounded-lg border p-4'>
            <Inbox className='text-muted-foreground mt-0.5 size-5 shrink-0' />

            <div className='space-y-1'>
              <p className='text-sm font-medium'>Don&apos;t see the email?</p>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                Check your spam or junk folder. It may take a few minutes for
                the email to arrive.
              </p>
            </div>
          </div>

          <div className='space-y-4 border-t pt-6'>
            <div className='space-y-1 text-center'>
              <h3 className='font-semibold'>
                Need another verification email?
              </h3>
              <p className='text-muted-foreground text-sm'>
                Enter your email address below to request another verification
                link.
              </p>
            </div>

            <form
              onSubmit={handleResend}
              className='space-y-3'
            >
              <div className='space-y-2'>
                <Label htmlFor='verification-email'>Email address</Label>

                <Input
                  id='verification-email'
                  type='email'
                  placeholder='you@example.com'
                  autoComplete='email'
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setMessage('');
                    setError('');
                    setHasRequested(false);
                  }}
                  disabled={isPending}
                />
              </div>

              <Button
                type='submit'
                variant='outline'
                className='w-full'
                disabled={isPending || hasRequested || !email.trim()}
              >
                <RefreshCw
                  className={isPending ? 'size-4 animate-spin' : 'size-4'}
                />
                {isPending
                  ? 'Sending request...'
                  : hasRequested
                    ? 'Request submitted'
                    : 'Resend Verification Email'}
              </Button>

              {message && (
                <p
                  role='status'
                  className='text-muted-foreground text-center text-sm'
                >
                  {message}
                </p>
              )}

              {error && (
                <p
                  role='alert'
                  className='text-destructive text-center text-sm'
                >
                  {error}
                </p>
              )}
            </form>
          </div>

          <p className='text-muted-foreground text-center text-sm'>
            Once your email is verified, you can sign in and start participating
            in CommuForge.
          </p>
        </CardContent>

        <CardFooter className='flex flex-col gap-4'>
          <Button
            nativeButton={false}
            render={<Link href='/sign-in' />}
            className='w-full'
          >
            Go to Sign In
            <ArrowRight className='size-4' />
          </Button>

          <p className='text-muted-foreground text-center text-sm'>
            Need to use a different email?{' '}
            <Link
              href='/sign-up'
              className='text-primary font-medium underline-offset-4 hover:underline'
            >
              Back to Sign Up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ValidateEmailPage;
