import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, Search, Shuffle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
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
import { adminApi, type AdminCaseItem } from '@/lib/admin-api';
import {
  CASE_TYPES,
  caseTypeLabel,
  judgeBench,
  STATUS_BADGES,
  type CaseStatus,
  type CaseType,
} from '@/lib/case-status';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AllocateDialog } from './AllocateDialog';

const PAGE_SIZE = 10;

/** Case Registry & Allocation: every case, with the pending-assignment queue highlighted. */
export default function AdminCasesPage() {
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CaseStatus | ''>((params.get('status') as CaseStatus) ?? '');
  const [courtId, setCourtId] = useState('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [allocating, setAllocating] = useState<AdminCaseItem | null>(null);

  const courts = useQuery({ queryKey: ['admin', 'courts'], queryFn: adminApi.courts });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'cases', { page, status, courtId, caseType, from, to, search }],
    queryFn: () =>
      adminApi.cases({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        courtId: courtId || undefined,
        caseType: caseType || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setPage(1);
      set(v);
    };
  const filtering = Boolean(search || status || courtId || caseType || from || to);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <>
      <PageHeader
        title="Case Registry & Allocation"
        description="All registered cases. Cases pending assignment are highlighted and can be allocated to a court, courtroom and judge."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Case Registry & Allocation' }]}
      />

      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Search and filter cases"
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2">
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
        <Field label="Status">
          {(p) => (
            <NativeSelect
              value={status}
              onChange={(e) => reset(setStatus)(e.target.value as CaseStatus | '')}
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
        <Field label="Case type">
          {(p) => (
            <NativeSelect
              value={caseType}
              onChange={(e) => reset(setCaseType)(e.target.value as CaseType | '')}
              {...p}
            >
              <option value="">All case types</option>
              {CASE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Court">
          {(p) => (
            <NativeSelect
              value={courtId}
              onChange={(e) => reset(setCourtId)(e.target.value)}
              {...p}
            >
              <option value="">All courts</option>
              {courts.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Filed from">
          {(p) => (
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => reset(setFrom)(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <Field label="Filed to">
          {(p) => (
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => reset(setTo)(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full sm:w-auto">
            <Search aria-hidden="true" /> Search
          </Button>
        </div>
      </form>

      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}

      {isPending ? (
        <TableSkeleton rows={8} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title={filtering ? 'No cases match your filters' : 'No cases registered yet'}
            description={
              filtering
                ? 'Try different filters or clear the search.'
                : 'Cases filed by litigants and lawyers will appear here.'
            }
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Case registry">
              <TableHeader>
                <TableRow>
                  <TableHead>Case number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Filed by</TableHead>
                  <TableHead>Judge bench</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((c) => {
                  const pending = c.status === 'PENDING_ASSIGNMENT';
                  return (
                    <TableRow
                      key={c.id}
                      className={cn(pending && 'border-l-4 border-l-accent bg-accent-soft')}
                    >
                      <TableCell className="whitespace-nowrap">
                        <Link to={`/admin/cases/${c.id}`} className="case-number font-medium">
                          {c.ucn}
                        </Link>
                      </TableCell>
                      <TableCell className="min-w-48 font-medium">{c.title}</TableCell>
                      <TableCell>{caseTypeLabel(c.caseType)}</TableCell>
                      <TableCell>{c.filedBy}</TableCell>
                      <TableCell className={c.judge ? undefined : 'text-text-muted'}>
                        {judgeBench(c)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(c.filingDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(pending || c.status === 'ALLOCATED') && (
                          <Button
                            size="sm"
                            variant={pending ? 'primary' : 'secondary'}
                            onClick={() => setAllocating(c)}
                            aria-label={`${pending ? 'Allocate' : 'Re-allocate'} ${c.ucn}`}
                          >
                            <Shuffle aria-hidden="true" /> {pending ? 'Allocate' : 'Re-allocate'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {allocating && (
        <AllocateDialog
          open
          caseId={allocating.id}
          ucn={allocating.ucn}
          reallocate={allocating.status === 'ALLOCATED'}
          onOpenChange={(o) => !o && setAllocating(null)}
        />
      )}
    </>
  );
}
