import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Copy,
  MoreHorizontal,
  PauseCircle,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  adminApi,
  type AdminUser,
  type CreateStaffPayload,
  type StatusAction,
} from '@/lib/admin-api';
import { applyServerError } from '@/lib/form-errors';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/navigation';
import { CNIC_REGEX, MESSAGES, PHONE_REGEX, summaryFor } from '@/lib/schemas';
import type { Role, UserStatus } from '@/lib/types';
import { fullName, USER_STATUS_LABEL, UserStatusBadge, VerificationBadge } from './shared';

const PAGE_SIZE = 10;
const STAFF_ROLES: CreateStaffPayload['role'][] = ['JUDGE', 'INTERN', 'PROCESS_SERVER', 'ADMIN'];

const ACTIONS: Record<
  StatusAction,
  {
    menu: string;
    title: string;
    confirm: string;
    text: (name: string) => string;
    destructive: boolean;
  }
> = {
  suspend: {
    menu: 'Suspend User Account',
    title: 'Suspend this account?',
    confirm: 'Suspend User Account',
    text: (n) => `${n} will be signed out and cannot log in until the account is reactivated.`,
    destructive: true,
  },
  block: {
    menu: 'Revoke System Access Rights',
    title: 'Revoke system access rights?',
    confirm: 'Revoke Access',
    text: (n) => `${n} will lose all access to the system immediately.`,
    destructive: true,
  },
  reactivate: {
    menu: 'Reactivate',
    title: 'Reactivate this account?',
    confirm: 'Reactivate',
    text: (n) => `${n} will be able to log in again.`,
    destructive: false,
  },
  delete: {
    menu: 'Delete',
    title: 'Delete this account?',
    confirm: 'Delete',
    text: (n) =>
      `${n} will be deactivated permanently and cannot log in. Their cases and audit history are kept.`,
    destructive: true,
  },
};

/** Which actions make sense for the current status. */
function allowedActions(status: UserStatus): StatusAction[] {
  switch (status) {
    case 'ACTIVE':
      return ['suspend', 'block', 'delete'];
    case 'SUSPENDED':
      return ['reactivate', 'block', 'delete'];
    case 'BLOCKED':
      return ['reactivate', 'delete'];
    default:
      return [];
  }
}

const ACTION_ICON = {
  suspend: PauseCircle,
  block: Ban,
  reactivate: CheckCircle2,
  delete: Trash2,
} as const;

// ---------------------------------------------------------------- add staff

const staffSchema = z
  .object({
    role: z.enum(['INTERN', 'PROCESS_SERVER', 'JUDGE', 'ADMIN']),
    firstName: z
      .string()
      .trim()
      .min(1, MESSAGES.fieldRequired)
      .max(50, 'Use 50 characters or fewer.'),
    lastName: z
      .string()
      .trim()
      .min(1, MESSAGES.fieldRequired)
      .max(50, 'Use 50 characters or fewer.'),
    cnic: z
      .string()
      .trim()
      .min(1, MESSAGES.fieldRequired)
      .regex(CNIC_REGEX, 'CNIC must be in the format 12345-1234567-1.'),
    email: z.string().trim().min(1, MESSAGES.fieldRequired).email('Enter a valid email address.'),
    phone: z
      .string()
      .trim()
      .min(1, MESSAGES.fieldRequired)
      .regex(PHONE_REGEX, 'Phone must be in the format +92 3XX XXXXXXX.'),
    courtId: z.string().optional(),
    courtroomId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'JUDGE' && !v.courtId) {
      ctx.addIssue({ code: 'custom', path: ['courtId'], message: 'Choose the judge’s court.' });
    }
  });
type StaffValues = z.infer<typeof staffSchema>;
const STAFF_FIELDS = [
  'role',
  'firstName',
  'lastName',
  'cnic',
  'email',
  'phone',
  'courtId',
  'courtroomId',
];

function AddStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; link: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<StaffValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      role: 'JUDGE',
      firstName: '',
      lastName: '',
      cnic: '',
      email: '',
      phone: '',
      courtId: '',
      courtroomId: '',
    },
  });
  const role = useWatch({ control, name: 'role' });
  const courtId = useWatch({ control, name: 'courtId' });

  const courts = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: adminApi.courts,
    enabled: open,
  });
  const rooms =
    courts.data?.find((c) => c.id === courtId)?.courtrooms.filter((r) => r.isActive) ?? [];

  const create = useMutation({
    mutationFn: (values: StaffValues) =>
      adminApi.createStaff({
        ...values,
        courtId: values.role === 'JUDGE' ? values.courtId || undefined : undefined,
        courtroomId: values.role === 'JUDGE' ? values.courtroomId || undefined : undefined,
      }),
    onSuccess: async (res) => {
      setCreated({ name: fullName(res.user), email: res.user.email, link: res.resetLink });
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => setFormError(applyServerError(e, setError, STAFF_FIELDS)),
  });

  function close(next: boolean) {
    if (!next) {
      reset();
      setFormError(null);
      setCreated(null);
      setCopied(false);
    }
    onOpenChange(next);
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                {created.name} ({created.email}) can set a password with the link below.
              </DialogDescription>
            </DialogHeader>
            <Alert variant="error" title="Shown only once">
              This link is not stored and cannot be shown again. Copy it now and give it to the
              staff member. It is valid for 72 hours.
            </Alert>
            <div className="mt-4 space-y-2">
              <label htmlFor="reset-link" className="block text-sm font-medium">
                One-time password setup link
              </label>
              <div className="flex gap-2">
                <input
                  id="reset-link"
                  readOnly
                  value={created.link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm"
                />
                <Button variant="secondary" onClick={copyLink}>
                  <Copy aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(
              (v) => {
                setFormError(null);
                create.mutate(v);
              },
              (errs) => setFormError(summaryFor(errs)),
            )}
          >
            <DialogHeader>
              <DialogTitle>Add staff account</DialogTitle>
              <DialogDescription>
                The person receives a link to choose their own password. Public registration stays
                for litigants and lawyers only.
              </DialogDescription>
            </DialogHeader>
            {formError && (
              <Alert variant="error" className="mb-4">
                {formError}
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Role" required error={errors.role?.message}>
                  {(p) => (
                    <NativeSelect {...register('role')} {...p}>
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              </div>
              <Field label="First name" required error={errors.firstName?.message}>
                {(p) => <Input autoComplete="off" {...register('firstName')} {...p} />}
              </Field>
              <Field label="Last name" required error={errors.lastName?.message}>
                {(p) => <Input autoComplete="off" {...register('lastName')} {...p} />}
              </Field>
              <Field label="CNIC" required hint="12345-1234567-1" error={errors.cnic?.message}>
                {(p) => (
                  <Input
                    inputMode="numeric"
                    placeholder="12345-1234567-1"
                    {...register('cnic')}
                    {...p}
                  />
                )}
              </Field>
              <Field label="Phone" required hint="+92 3XX XXXXXXX" error={errors.phone?.message}>
                {(p) => (
                  <Input
                    inputMode="tel"
                    placeholder="+92 300 1234567"
                    {...register('phone')}
                    {...p}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Email" required error={errors.email?.message}>
                  {(p) => <Input type="email" autoComplete="off" {...register('email')} {...p} />}
                </Field>
              </div>
              {role === 'JUDGE' && (
                <>
                  <Field label="Court" required error={errors.courtId?.message}>
                    {(p) => (
                      <Controller
                        control={control}
                        name="courtId"
                        render={({ field }) => (
                          <NativeSelect
                            value={field.value ?? ''}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                            }}
                            {...p}
                          >
                            <option value="">Choose a court</option>
                            {courts.data?.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                      />
                    )}
                  </Field>
                  <Field label="Courtroom (optional)" error={errors.courtroomId?.message}>
                    {(p) => (
                      <NativeSelect disabled={!courtId} {...register('courtroomId')} {...p}>
                        <option value="">No fixed courtroom</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </Field>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                <UserPlus aria-hidden="true" /> Create account
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- page

/** UC-2.1: Global Account Management & Registry Control. */
export default function AccountsPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<{ user: AdminUser; action: StatusAction } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'users', { page, role, status, search }],
    queryFn: () =>
      adminApi.users({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        role: (role || undefined) as Role | undefined,
        status: (status || undefined) as UserStatus | undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const change = useMutation({
    mutationFn: (v: { id: string; action: StatusAction }) => adminApi.changeStatus(v.id, v.action),
    onSuccess: async (res) => {
      setBanner(res.message);
      toast.success(res.message);
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => {
      setPending(null);
      setBanner(null);
      toast.error(parseApiError(e).message);
    },
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <>
      <PageHeader
        title="Global Account Management & Registry Control"
        description="Every registered litigant, lawyer and staff account."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Account Management' }]}
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden="true" /> Add staff account
          </Button>
        }
      />

      {banner && (
        <Alert variant="success" className="mb-4">
          {banner}
        </Alert>
      )}

      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Search accounts"
        className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end"
      >
        <div className="flex-1">
          <Field label="Search">
            {(p) => (
              <Input
                type="search"
                placeholder="Name, email or CNIC"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
        <div className="lg:w-48">
          <Field label="Role">
            {(p) => (
              <NativeSelect
                value={role}
                onChange={(e) => {
                  setPage(1);
                  setRole(e.target.value);
                }}
                {...p}
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
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
                  setStatus(e.target.value);
                }}
                {...p}
              >
                <option value="">All statuses</option>
                {(Object.keys(USER_STATUS_LABEL) as UserStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {USER_STATUS_LABEL[s]}
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
        <TableSkeleton rows={8} cols={6} />
      ) : data && data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="No accounts found"
            description="Try a different search or clear the filters."
          />
        </Card>
      ) : (
        data && (
          <>
            <Table aria-label="Accounts">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>CNIC</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((u) => {
                  const actions = allowedActions(u.status);
                  const name = fullName(u);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="min-w-48">
                        <span className="block font-medium">{name}</span>
                        <span className="block text-text-muted">{u.email}</span>
                        {u.id === me?.id && (
                          <Badge variant="accent" className="mt-1">
                            You
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {u.cnic}
                      </TableCell>
                      <TableCell>
                        <span className="block">{ROLE_LABEL[u.role]}</span>
                        {u.court && <span className="block text-text-muted">{u.court.name}</span>}
                        {u.lawyerProfile && (
                          <span className="mt-1 block">
                            <VerificationBadge status={u.lawyerProfile.verificationStatus} />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <UserStatusBadge status={u.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(u.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {actions.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${name}`}
                              >
                                <MoreHorizontal aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {actions.map((a, i) => {
                                const Icon = ACTION_ICON[a];
                                return (
                                  <div key={a}>
                                    {a === 'delete' && i > 0 && <DropdownMenuSeparator />}
                                    <DropdownMenuItem
                                      destructive={a !== 'reactivate'}
                                      onSelect={() => setPending({ user: u, action: a })}
                                    >
                                      <Icon aria-hidden="true" /> {ACTIONS[a].menu}
                                    </DropdownMenuItem>
                                  </div>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <AddStaffDialog open={adding} onOpenChange={setAdding} />

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={ACTIONS[pending.action].title}
          description={ACTIONS[pending.action].text(fullName(pending.user))}
          confirmLabel={ACTIONS[pending.action].confirm}
          destructive={ACTIONS[pending.action].destructive}
          loading={change.isPending}
          onConfirm={() => change.mutate({ id: pending.user.id, action: pending.action })}
        />
      )}
    </>
  );
}
