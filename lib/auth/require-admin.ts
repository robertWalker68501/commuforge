import { headers } from 'next/headers';
import { auth } from '../auth';
import { redirect } from 'next/navigation';

export const requireAdmin = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/sign-in');
  }

  if (session.user.role !== 'admin' && session.user.role !== 'owner') {
    redirect('/dashboard');
  }

  return session;
};
