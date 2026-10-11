import { QueryError } from '@/components/ui/query-error';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Archive } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { casesApi } from '@/lib/cases-api';
import { PORTALS, portalPath } from '@/lib/navigation';
import { useTranslation } from 'react-i18next';

/** "Evidence Vault Workspace": pick a case, then manage its vault. */
export default function EvidenceIndexPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['cases', 'list', 'vault', page],
    queryFn: () => casesApi.list({ page, limit: 10 }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  });
  if (!user) return null;
  const portal = PORTALS[user.role];
  const base = portalPath(portal, 'cases');

  return (
    <>
      <PageHeader
        title={t('Evidence Vault Workspace')}
        description={t('Open a case to manage its pleadings and submit digital exhibits.')}
        crumbs={[
          { label: t('Dashboard'), to: portalPath(portal, '') },
          { label: t('Evidence Vault') },
        ]}
      />
      {isError && <QueryError error={error} />}
      {isPending ? (
        <TableSkeleton rows={5} cols={4} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Archive}
            title={t('No cases yet')}
            description={t('Exhibits belong to a case. File a case first.')}
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label={t('Cases')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Case number')}</TableHead>
                  <TableHead>{t('Title')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('Action')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="case-number whitespace-nowrap font-medium">
                      {c.ucn}
                    </TableCell>
                    <TableCell className="min-w-48 font-medium">
                      <bdi>{c.title}</bdi>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" variant="secondary" asChild>
                        <Link to={`${base}/${c.id}?tab=documents`}>{t('Manage Vault Docs')}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPageChange={setPage}
            />
          </>
        )
      )}
    </>
  );
}
