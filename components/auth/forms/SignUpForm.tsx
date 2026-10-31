'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { createUserSchema } from '@/lib/schemas/UserSchema';
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

const SignUpForm = () => {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = (data: z.infer<typeof createUserSchema>) => {
    const { name, email, password } = data;

    startTransition(async () => {
      await authClient.signUp.email(
        {
          name,
          email,
          password,
          callbackURL: '/sign-in',
        },
        {
          onSuccess: () => {
            toast.add({
              type: 'success',
              title: 'Please check your email.',
            });

            form.reset();
            router.push('/validate-email');
          },
          onError: () => {
            toast.add({
              type: 'error',
              title: 'Failed to create account.',
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
        <CardTitle>Create Account</CardTitle>
        <CardDescription>All field are required.</CardDescription>
      </CardHeader>
      <form
        id='create-account-form'
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <CardContent>
          <FieldGroup>
            <FormFieldControl
              control={form.control}
              name='name'
              label='Full Name'
              type='text'
              placeholder='John Doe'
            />
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
            <FormFieldControl
              control={form.control}
              name='confirmPassword'
              label='Confirm Password'
              type='password'
              placeholder='**********'
            />
            <div className='flex w-full flex-col gap-4'>
              <div className='flex w-full items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={isPending}
                    onClick={() => form.reset()}
                  >
                    Clear
                  </Button>
                  <Button
                    type='submit'
                    form='create-account-form'
                    disabled={isPending}
                  >
                    {isPending ? <Spinner /> : 'Sign Up'}
                  </Button>
                </div>
                <p className='text-muted-foreground text-sm'>
                  Already have an account{' '}
                  <Link
                    href='/sign-in'
                    className='hover:text-primary'
                  >
                    Sign In
                  </Link>
                </p>
              </div>
              <SeparatorWithText text='OR' />
              <div className='w-full'>
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

export default SignUpForm;
