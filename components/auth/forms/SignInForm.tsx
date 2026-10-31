'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { signInUserSchema } from '@/lib/schemas/UserSchema';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { toast } from '@/components/ui/toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { FormFieldControl } from '@/components/form-fields/FormFieldControl';
import SeparatorWithText from '@/components/SeparatorWithText';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import Link from 'next/link';
import { IoLogoGithub } from 'react-icons/io5';

const SignInForm = () => {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<z.infer<typeof signInUserSchema>>({
    resolver: zodResolver(signInUserSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (data: z.infer<typeof signInUserSchema>) => {
    const { email, password } = data;

    startTransition(async () => {
      await authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onSuccess: () => {
            toast.add({
              type: 'success',
              title: 'Signed in successfully.',
            });
            form.reset();
            router.push('/dashboard');
          },
          onError: () => {
            toast.add({
              type: 'error',
              title: 'Failed to sign in.',
            });
          },
        }
      );
    });
  };

  const SignInWithGitHub = async () => {
    await authClient.signIn.social({
      provider: 'github',
    });
  };

  return (
    <Card className='mx-auto max-w-lg'>
      <CardHeader>
        <CardTitle>Sign in to your Account</CardTitle>
        <CardDescription>All field are required.</CardDescription>
      </CardHeader>
      <form
        id='sign-in-form'
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <CardContent>
          <FieldGroup>
            <FormFieldControl
              control={form.control}
              name='email'
              label='Email'
              type='email'
              placeholder='john.doe@example.com'
            />
            <FormFieldControl
              control={form.control}
              name='password'
              label='Password'
              type='password'
              placeholder='**********'
            />
            <div className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center'>
                  <Button
                    type='submit'
                    form='sign-in-form'
                    disabled={isPending}
                  >
                    {isPending ? <Spinner /> : 'Sign In'}
                  </Button>
                </div>
                <p className='text-muted-foreground text-sm'>
                  Don&apos;t have an account{' '}
                  <Link
                    href='/sign-up'
                    className='hover:text-primary'
                  >
                    Sign Up
                  </Link>
                </p>
              </div>
              <SeparatorWithText text='OR' />
              <div>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={SignInWithGitHub}
                >
                  Sign in with GitHub <IoLogoGithub />
                </Button>
              </div>
            </div>
          </FieldGroup>
        </CardContent>
      </form>
    </Card>
  );
};

export default SignInForm;
