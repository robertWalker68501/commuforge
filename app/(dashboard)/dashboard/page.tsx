import { Spinner } from '@/components/ui/spinner';
import { requireAuth } from '@/lib/auth/require-auth';
import { Suspense } from 'react';

const ViewDashboard = async () => {
  await requireAuth();

  return <div>Dashboard</div>;
};

const Dashboard = () => {
  return (
    <Suspense
      fallback={
        <div>
          <Spinner />
        </div>
      }
    >
      <ViewDashboard />
    </Suspense>
  );
};

export default Dashboard;
