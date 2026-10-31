import { headers } from 'next/headers';
import { auth } from '../auth';
import { redirect } from 'next/navigation';

export const requireAuth = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/sign-in');
  }

  return session;
};
