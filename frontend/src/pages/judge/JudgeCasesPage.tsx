import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { Link } from 'react-router';
import { parseApiError } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { caseTypeLabel } from '@/lib/case-status';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 10;

/** "My Allocated Cases": the table shown on the judge dashboard and on /judge/cases. */
export function MyAllocatedCases() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['judge', 'cases', { page, search }],
    queryFn: () => adminApi.judgeCases({ page, limit: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Allocated Cases</CardTitle>
        <p className="text-sm text-text-muted">Cases the registrar has allocated to you.</p>
      </CardHeader>
      <div className="space-y-4 p-5">
        <form
          onSubmit={onSearch}
          role="search"
          aria-label="Search allocated cases"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field label="Search by case number or title">
              {(p) => (
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  {...p}
                />
              )}
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" /> Search
          </Button>
        </form>

        {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}

        {isPending ? (
          <TableSkeleton rows={5} cols={6} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={search ? 'No cases match your search' : 'No cases allocated to you yet'}
            description={
              search
                ? 'Try a different case number or title.'
                : 'When the registrar allocates a case to you, it will be listed here.'
            }
          />
        ) : (
          data && (
            <>
              <Table aria-label="My allocated cases">
                <TableHeader>
                  <TableRow>
                    <TableHead>Case number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Filing date</TableHead>
                    <TableHead>Filed by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link to={`/judge/cases/${c.id}`} className="case-number font-medium">
                          {c.ucn}
                        </Link>
                      </TableCell>
                      <TableCell className="min-w-48 font-medium">{c.title}</TableCell>
                      <TableCell>{caseTypeLabel(c.caseType)}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(c.filingDate)}
                      </TableCell>
                      <TableCell>{c.filedBy}</TableCell>
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
      </div>
    </Card>
  );
}

export default function JudgeCasesPage() {
  return (
    <>
      <PageHeader
        title="My Allocated Cases"
        description="Cases allocated to you by the registrar."
        crumbs={[{ label: 'Dashboard', to: '/judge' }, { label: 'My Allocated Cases' }]}
      />
      <MyAllocatedCases />
    </>
  );
}
