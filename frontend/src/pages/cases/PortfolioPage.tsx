import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, FilePlus2, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { useFilingGate } from '@/hooks/use-filing-gate';
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
import { caseTypeLabel, judgeBench, STATUS_BADGES, type CaseStatus } from '@/lib/case-status';
import { formatDate } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import { MESSAGES } from '@/lib/schemas';

const PAGE_SIZE = 10;

/** UC-2.3: the caller's case portfolio. */
export default function PortfolioPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const gate = useFilingGate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['cases', 'list', { page, status, search }],
    queryFn: () =>
      casesApi.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
      }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  });

  if (!user) return null;
  const portal = PORTALS[user.role];
  const base = portalPath(portal, 'cases');
  const filtering = Boolean(search || status);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <>
      <PageHeader
        title="My Case Portfolio"
        description="Every case you filed or appear in, with its current judge bench and status."
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'My Case Portfolio' },
        ]}
        actions={
          gate.canFile ? (
            <Button asChild>
              <Link to={portalPath(portal, 'new-case')}>
                <FilePlus2 aria-hidden="true" /> New Case Submission
              </Link>
            </Button>
          ) : (
            <Button disabled title={gate.reason ?? undefined}>
              <FilePlus2 aria-hidden="true" /> New Case Submission
            </Button>
          )
        }
      />

      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Search cases"
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field label="Search by case number or title">
            {(p) => (
              <Input
                type="search"
                placeholder="For example DA-2026-CIV or Muhammad Ali"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
        <div className="sm:w-56">
          <Field label="Status">
            {(p) => (
              <NativeSelect
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value as CaseStatus | '');
                }}
                {...p}
              >
                <option value="">All statuses</option>
                {(Object.keys(STATUS_BADGES) as CaseStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_BADGES[s].label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" /> Search
        </Button>
      </form>

      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}

      {isPending ? (
        <TableSkeleton rows={6} cols={5} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title={filtering ? 'No cases match your search' : MESSAGES.emptyPortfolio}
            description={
              filtering
                ? 'Try a different case number, title or status.'
                : 'Cases you file will appear here, together with their full history.'
            }
            action={
              !filtering && (
                <Button asChild>
                  <Link to={portalPath(portal, 'new-case')}>New Case Submission</Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Case portfolio">
              <TableHeader>
                <TableRow>
                  <TableHead>Case number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Case type</TableHead>
                  <TableHead>Judge bench</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filing date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-primary-soft"
                    onClick={(e) => {
                      if (!(e.target as Element).closest('a')) navigate(`${base}/${c.id}`);
                    }}
                  >
                    <TableCell className="whitespace-nowrap">
                      <Link to={`${base}/${c.id}`} className="case-number font-medium">
                        {c.ucn}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-48 font-medium">{c.title}</TableCell>
                    <TableCell>{caseTypeLabel(c.caseType)}</TableCell>
                    <TableCell className={c.judge ? undefined : 'text-text-muted'}>
                      {judgeBench(c)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(c.filingDate)}</TableCell>
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
