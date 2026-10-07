import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Gavel, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  judgeOrdersApi,
  ORDER_OUTCOME_LABEL,
  type JudgeOrder,
  type OrderOutcome,
} from '@/lib/phase5-api';
import { isoToDdMmYyyy } from '@/lib/scheduling-api';

const PAGE_SIZE = 15;

const OUTCOME_VARIANT: Record<OrderOutcome, 'decided' | 'pending' | 'rejected' | 'hearing'> = {
  COMPLETED: 'hearing',
  ADJOURNED: 'pending',
  JUDGMENT: 'decided',
  DISMISSED: 'rejected',
  DISPOSED: 'decided',
};

export function OrderOutcomeBadge({ outcome }: { outcome: OrderOutcome }) {
  return <Badge variant={OUTCOME_VARIANT[outcome]}>{ORDER_OUTCOME_LABEL[outcome]}</Badge>;
}

const orderKindLabel = (o: JudgeOrder) =>
  o.kind === 'DECISION' ? 'Final decision' : 'Hearing order';

/** Judge "Orders": hearing outcomes and final decisions recorded on the judge's own cases. */
export default function JudgeOrdersPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<OrderOutcome | ''>('');
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['judge', 'orders', { page, search, outcome }],
    queryFn: () =>
      judgeOrdersApi.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        outcome: outcome || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const filtered = Boolean(search || outcome);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Hearing orders and final decisions you have recorded, newest first."
        crumbs={[{ label: 'Dashboard', to: '/judge' }, { label: 'Orders' }]}
      />
      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Search orders"
        className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
      >
        <Field label="Search by case number, title or party">
          {(p) => (
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <Field label="Outcome">
          {(p) => (
            <NativeSelect
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value as OrderOutcome | '');
                setPage(1);
              }}
              {...p}
            >
              <option value="">All outcomes</option>
              {(Object.keys(ORDER_OUTCOME_LABEL) as OrderOutcome[]).map((o) => (
                <option key={o} value={o}>
                  {ORDER_OUTCOME_LABEL[o]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" /> Search
        </Button>
      </form>

      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <TableSkeleton rows={6} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Gavel}
            title={filtered ? 'No orders match your filters' : 'No orders recorded yet'}
            description={
              filtered
                ? 'Try another case number, party name or outcome.'
                : 'Outcomes you record on a hearing and final decisions appear here.'
            }
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Recorded orders and decisions">
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Parties</TableHead>
                  <TableHead>Hearing date</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Recorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link to={`/judge/cases/${o.caseId}`} className="case-number font-medium">
                        {o.ucn}
                      </Link>
                      <span className="block text-sm text-text-muted">{orderKindLabel(o)}</span>
                    </TableCell>
                    <TableCell className="min-w-48">
                      {o.parties.length > 0 ? o.parties.join(' vs. ') : o.title}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {o.hearingDate ? isoToDdMmYyyy(o.hearingDate) : '—'}
                      {o.hearingTime && (
                        <span className="block font-mono text-sm text-text-muted">
                          {o.hearingTime}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <OrderOutcomeBadge outcome={o.outcome} />
                    </TableCell>
                    <TableCell className="min-w-64 max-w-md">
                      <p className="line-clamp-3 text-sm" title={o.summary ?? undefined}>
                        {o.summary ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(o.recordedAt)}
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
