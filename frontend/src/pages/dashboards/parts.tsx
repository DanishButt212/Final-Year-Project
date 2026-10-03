import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ROLE_LABEL } from '@/lib/navigation';

export function DashboardFrame({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName} ${user.lastName}`}
        description={`${ROLE_LABEL[user.role]} dashboard. ${description}`}
        crumbs={[{ label: 'Dashboard' }]}
      />
      {children}
    </>
  );
}

/** A dashboard panel that is empty for now; the action points to the (future) feature page. */
export function EmptyPanel({
  title,
  icon,
  emptyTitle,
  emptyText,
  actionLabel,
  actionTo,
}: {
  title: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <EmptyState
        icon={icon}
        title={emptyTitle}
        description={emptyText}
        action={
          actionTo && actionLabel ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={actionTo}>{actionLabel}</Link>
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}

export const PanelGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{children}</div>
);
