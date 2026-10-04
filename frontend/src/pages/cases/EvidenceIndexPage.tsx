import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Archive } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
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
import { parseApiError } from '@/lib/api';
import { casesApi } from '@/lib/cases-api';
import { PORTALS, portalPath } from '@/lib/navigation';

/** "Evidence Vault Workspace": pick a case, then manage its vault. */
export default function EvidenceIndexPage() {
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
        title="Evidence Vault Workspace"
        description="Open a case to manage its pleadings and submit digital exhibits."
        crumbs={[{ label: 'Dashboard', to: portalPath(portal, '') }, { label: 'Evidence Vault' }]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <TableSkeleton rows={5} cols={4} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Archive}
            title="No cases yet"
            description="Exhibits belong to a case. File a case first."
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Cases">
              <TableHeader>
                <TableRow>
                  <TableHead>Case number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Action</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="case-number whitespace-nowrap font-medium">
                      {c.ucn}
                    </TableCell>
                    <TableCell className="min-w-48 font-medium">{c.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="secondary" asChild>
                        <Link to={`${base}/${c.id}?tab=documents`}>Manage Vault Docs</Link>
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
