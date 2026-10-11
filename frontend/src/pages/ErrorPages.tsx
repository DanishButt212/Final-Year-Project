import { Compass, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { roleHome } from '@/lib/navigation';
import { useTranslation } from 'react-i18next';

function HomeButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <Button asChild>
      <Link to={user ? roleHome(user.role) : '/'}>
        {user ? t('Go to my dashboard') : t('Back to home')}
      </Link>
    </Button>
  );
}

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title={t('403: You do not have access to this page')}
          titleAs="h1"
          description={t(
            'Your account type cannot open this page. If you think this is a mistake, contact an administrator.',
          )}
          action={<HomeButton />}
        />
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <EmptyState
          icon={Compass}
          title={t('404: Page not found')}
          titleAs="h1"
          description={t('The page you are looking for does not exist or has been moved.')}
          action={<HomeButton />}
        />
      </Card>
    </div>
  );
}
