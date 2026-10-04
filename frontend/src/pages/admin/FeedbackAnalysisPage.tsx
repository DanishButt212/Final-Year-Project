import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Search, Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/navigation';
import {
  FEEDBACK_CATEGORIES,
  feedbackApi,
  type FeedbackCategory,
  type FeedbackItem,
  type FeedbackStatus,
} from '@/lib/phase4-api';

const PAGE_SIZE = 10;
const STATUS: Record<
  FeedbackStatus,
  { label: string; variant: 'pending' | 'decided' | 'neutral' }
> = {
  NEW: { label: 'New', variant: 'pending' },
  PROCESSED: { label: 'Processed', variant: 'decided' },
  ARCHIVED: { label: 'Archived', variant: 'neutral' },
};
const categoryLabel = (c: FeedbackCategory) =>
  FEEDBACK_CATEGORIES.find((x) => x.value === c)?.label ?? c;

function FeedbackDetail({ item, onClose }: { item: FeedbackItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [forward, setForward] = useState(item.forwardToMaintenance);
  const [banner, setBanner] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => feedbackApi.adminUpdate(item.id, { status, forwardToMaintenance: forward }),
    onSuccess: async (res) => {
      setBanner(res.message);
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{categoryLabel(item.category)} feedback</DialogTitle>
          <DialogDescription>
            {item.user ? `${item.user.name} (${ROLE_LABEL[item.user.role]})` : 'Unknown user'} ·{' '}
            {formatDate(item.createdAt)}
            {item.rating !== null && ` · ${item.rating}/5`}
          </DialogDescription>
        </DialogHeader>
        {banner && (
          <Alert variant="success" className="mb-3">
            {banner}
          </Alert>
        )}
        <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4">
          {item.message}
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={forward}
              onChange={(e) => setForward(e.target.checked)}
            />
            Forward to maintenance
          </label>
          <Field label="Status">
            {(p) => (
              <NativeSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
                {...p}
              >
                <option value="NEW">New</option>
                <option value="PROCESSED">Processed</option>
                <option value="ARCHIVED">Archived</option>
              </NativeSelect>
            )}
          </Field>
          {item.reviewedAt && (
            <p className="text-sm text-text-muted">
              Last reviewed {formatDate(item.reviewedAt)}
              {item.reviewedBy && ` by ${item.reviewedBy}`}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin: "User Feedback Analysis & Quality Control". */
export default function FeedbackAnalysisPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'feedback', { page, status, category, search }],
    queryFn: () =>
      feedbackApi.adminList({
        page,
        limit: PAGE_SIZE,
        status: status || undefined,
        category: category || undefined,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const selected = data?.data.find((f) => f.id === open) ?? null;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <>
      <PageHeader
        title="User Feedback Analysis & Quality Control"
        description="Read feedback, tag items for the software maintenance team and mark them processed or archived."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'User Feedback' }]}
      />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent>
              <p className="text-3xl font-bold">{data.meta.total}</p>
              <p className="text-sm text-text-muted">Matching feedback</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="flex items-center gap-1.5 text-3xl font-bold">
                {data.summary.averageRating ?? '—'}
                <Star className="size-6 text-accent" aria-hidden="true" />
              </p>
              <p className="text-sm text-text-muted">
                Average rating ({data.summary.ratedCount} rated)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-3xl font-bold">{data.summary.byStatus.NEW ?? 0}</p>
              <p className="text-sm text-text-muted">New, awaiting review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="mb-1 text-sm font-semibold">By category</p>
              <ul className="text-sm">
                {FEEDBACK_CATEGORIES.map((c) => (
                  <li key={c.value} className="flex justify-between">
                    <span>{c.label}</span>
                    <span className="font-semibold">{data.summary.byCategory[c.value] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Search and filter feedback"
        className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end"
      >
        <div className="flex-1">
          <Field label="Search">
            {(p) => (
              <Input
                type="search"
                placeholder="Words in the feedback"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
        <div className="lg:w-48">
          <Field label="Status">
            {(p) => (
              <NativeSelect
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value as FeedbackStatus | '');
                }}
                {...p}
              >
                <option value="">All statuses</option>
                <option value="NEW">New</option>
                <option value="PROCESSED">Processed</option>
                <option value="ARCHIVED">Archived</option>
              </NativeSelect>
            )}
          </Field>
        </div>
        <div className="lg:w-52">
          <Field label="Category">
            {(p) => (
              <NativeSelect
                value={category}
                onChange={(e) => {
                  setPage(1);
                  setCategory(e.target.value as FeedbackCategory | '');
                }}
                {...p}
              >
                <option value="">All categories</option>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
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
        <TableSkeleton rows={6} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareText}
            title="No feedback found"
            description="Try different filters."
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Feedback">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(f.createdAt)}</TableCell>
                    <TableCell>
                      {f.user?.name ?? '—'}
                      {f.rating !== null && (
                        <span className="block text-sm text-text-muted">{f.rating}/5</span>
                      )}
                    </TableCell>
                    <TableCell>{categoryLabel(f.category)}</TableCell>
                    <TableCell className="min-w-56">
                      <span className="line-clamp-2">{f.message}</span>
                      {f.forwardToMaintenance && (
                        <Badge variant="hearing" className="mt-1">
                          Forwarded to maintenance
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS[f.status].variant}>{STATUS[f.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setOpen(f.id)}
                        aria-label={`Review feedback from ${f.user?.name ?? 'user'}`}
                      >
                        Review
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
      {selected && (
        <FeedbackDetail key={selected.id} item={selected} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
