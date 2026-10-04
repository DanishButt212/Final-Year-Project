import { Compass, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { roleHome } from '@/lib/navigation';

function HomeButton() {
  const { user } = useAuth();
  return (
    <Button asChild>
      <Link to={user ? roleHome(user.role) : '/'}>
        {user ? 'Go to my dashboard' : 'Back to home'}
      </Link>
    </Button>
  );
}

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="403: You do not have access to this page"
          titleAs="h1"
          description="Your account type cannot open this page. If you think this is a mistake, contact an administrator."
          action={<HomeButton />}
        />
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <EmptyState
          icon={Compass}
          title="404: Page not found"
          titleAs="h1"
          description="The page you are looking for does not exist or has been moved."
          action={<HomeButton />}
        />
      </Card>
    </div>
  );
}
