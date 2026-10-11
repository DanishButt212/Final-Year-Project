import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ShieldCheck, ShieldX, UserCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { Textarea } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { adminApi, type BarCheckResult, type LawyerItem } from '@/lib/admin-api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { VerificationStatus } from '@/lib/types';
import { fullName } from './admin-helpers';
import { UserStatusBadge, VerificationBadge } from './shared';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const PAGE_SIZE = 10;
const REJECT_REASON_REQUIRED = msg('Please enter a reason for rejection.');

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function LawyerPanel({
  lawyer,
  onDone,
}: {
  lawyer: LawyerItem;
  onDone: (message: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [bar, setBar] = useState<BarCheckResult | null>(null);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const editable = lawyer.verificationStatus !== 'VERIFIED';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const check = useMutation({
    mutationFn: () => adminApi.barCheck(lawyer.id),
    onSuccess: setBar,
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const verify = useMutation({
    mutationFn: () => adminApi.verifyLawyer(lawyer.id),
    onSuccess: async (res) => {
      setConfirmVerify(false);
      toast.success(res.message);
      onDone(res.message);
      await refresh();
    },
    onError: (e) => {
      setConfirmVerify(false);
      toast.error(parseApiError(e).message);
    },
  });
  const reject = useMutation({
    mutationFn: () => adminApi.rejectLawyer(lawyer.id, reason.trim()),
    onSuccess: async (res) => {
      setRejecting(false);
      setReason('');
      toast.success(res.message);
      onDone(res.message);
      await refresh();
    },
    onError: (e) =>
      setReasonError(parseApiError(e).details?.[0]?.messages[0] ?? parseApiError(e).message),
  });

  function submitReject() {
    if (!reason.trim()) {
      setReasonError(REJECT_REASON_REQUIRED);
      return;
    }
    setReasonError(null);
    reject.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{fullName(lawyer.user)}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <VerificationBadge status={lawyer.verificationStatus} />
          <UserStatusBadge status={lawyer.user.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label={t('Bar number')}>
            <span className="case-number">{lawyer.barNumber ?? t('Not submitted')}</span>
          </Detail>
          <Detail label={t('Registered on')}>{formatDate(lawyer.registeredAt)}</Detail>
          <Detail label="CNIC">
            <span className="font-mono text-sm">{lawyer.user.cnic}</span>
          </Detail>
          <Detail label={t('Phone')}>{lawyer.user.phone}</Detail>
          <div className="sm:col-span-2">
            <Detail label={t('Email')}>{lawyer.user.email}</Detail>
          </div>
          {lawyer.verificationStatus === 'VERIFIED' && (
            <Detail label={t('Verified')}>
              {formatDateTime(lawyer.verifiedAt)}
              {lawyer.verifiedBy && ` by ${lawyer.verifiedBy}`}
            </Detail>
          )}
          {lawyer.verificationStatus === 'REJECTED' && (
            <div className="sm:col-span-2">
              <Detail label={t('Reason for rejection')}>{lawyer.rejectionReason}</Detail>
            </div>
          )}
        </dl>

        {lawyer.verificationStatus === 'VERIFIED' ? (
          <Alert variant="success" title={t('Credentials locked')}>
            {t(
              'Verified credentials cannot be changed. Suspend the account from Account Management if access must be withdrawn.',
            )}
          </Alert>
        ) : (
          <>
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="font-semibold">{t('Bar Council repository')}</p>
              <Button variant="secondary" onClick={() => check.mutate()} loading={check.isPending}>
                <ShieldCheck aria-hidden="true" /> {t('Cross-check with Bar Council')}
              </Button>
              {bar && (
                <div aria-live="polite" className="space-y-1">
                  <Badge variant={bar.found ? 'decided' : 'rejected'}>
                    {bar.found ? t('Found in repository') : t('Not found in repository')}
                  </Badge>
                  <p className="text-sm text-text-muted">
                    {t('{{reason}} Checked {{dateTime}}.', {
                      reason: bar.reason,
                      dateTime: formatDateTime(bar.checkedAt),
                    })}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setConfirmVerify(true)} disabled={!editable}>
                <BadgeCheck aria-hidden="true" /> {t('Verify and Approve Account')}
              </Button>
              <Button variant="destructive" onClick={() => setRejecting(true)}>
                <XCircle aria-hidden="true" /> {t('Reject Request')}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmVerify}
        onOpenChange={setConfirmVerify}
        title={t('Verify and approve this lawyer?')}
        description={t(
          '{{fullName}} will be able to file cases. Once verified, the credentials are locked.',
          { fullName: fullName(lawyer.user) },
        )}
        confirmLabel={t('Verify and Approve Account')}
        loading={verify.isPending}
        onConfirm={() => verify.mutate()}
      />

      <Dialog
        open={rejecting}
        onOpenChange={(o) => {
          if (!reject.isPending) {
            setRejecting(o);
            if (!o) setReasonError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Reject this request')}</DialogTitle>
            <DialogDescription>
              {t(
                'The account will be set to Rejected/Suspended and the lawyer will not be able to log in.',
              )}
            </DialogDescription>
          </DialogHeader>
          <Field label={t('Reason for rejection')} required error={reasonError ?? undefined}>
            {(p) => (
              <Textarea
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                {...p}
              />
            )}
          </Field>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setRejecting(false)}
              disabled={reject.isPending}
            >
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={submitReject} loading={reject.isPending}>
              {t('Reject Request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** UC-2.2: Pending Bar Affiliation Approvals. */
export default function LawyerVerificationPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<VerificationStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'lawyers', { tab, page }],
    queryFn: () => adminApi.lawyers({ status: tab, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const selected = data?.data.find((l) => l.id === selectedId) ?? null;
  const titles: Record<VerificationStatus, string> = {
    PENDING: t('Pending Bar Affiliation Approvals'),
    VERIFIED: t('Verified lawyers'),
    REJECTED: t('Rejected lawyers'),
  };

  return (
    <>
      <PageHeader
        title={t('Pending Bar Affiliation Approvals')}
        description={t("Check each lawyer's bar credentials before they can file cases.")}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('Lawyer Verification') }]}
      />
      {banner && (
        <Alert variant="success" className="mb-4">
          {banner}
        </Alert>
      )}
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as VerificationStatus);
          setPage(1);
          setSelectedId(null);
        }}
      >
        <TabsList aria-label={t('Lawyer status')}>
          <TabsTrigger value="PENDING">
            {t('Pending ({{value}})', { value: data?.counts.PENDING ?? 0 })}
          </TabsTrigger>
          <TabsTrigger value="VERIFIED">
            {t('Verified ({{value}})', { value: data?.counts.VERIFIED ?? 0 })}
          </TabsTrigger>
          <TabsTrigger value="REJECTED">
            {t('Rejected ({{value}})', { value: data?.counts.REJECTED ?? 0 })}
          </TabsTrigger>
        </TabsList>
        {(['PENDING', 'VERIFIED', 'REJECTED'] as const).map((s) => (
          // One panel per tab (only the active one has content), so each tab controls a real panel.
          <TabsContent key={s} value={s} forceMount className="pt-0">
            {tab === s && (
              <>
                {isError && (
                  <Alert variant="error" className="mt-4">
                    {parseApiError(error).message}
                  </Alert>
                )}

                <div className="mt-5 grid gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div>
                    {isPending ? (
                      <TableSkeleton rows={5} cols={4} />
                    ) : data && data.data.length === 0 ? (
                      <Card>
                        <EmptyState
                          icon={UserCheck}
                          title={
                            tab === 'PENDING'
                              ? t('No approvals pending')
                              : tab === 'VERIFIED'
                                ? t('No verified lawyers')
                                : t('No rejected lawyers')
                          }
                          description={
                            tab === 'PENDING'
                              ? t('New lawyer registrations will appear here for review.')
                              : t('Nothing to show in this list yet.')
                          }
                        />
                      </Card>
                    ) : (
                      data && (
                        <>
                          <Table aria-label={titles[tab]}>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('Lawyer')}</TableHead>
                                <TableHead>{t('Bar number')}</TableHead>
                                <TableHead>{t('Registered')}</TableHead>
                                <TableHead>{t('Status')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.data.map((l) => (
                                <TableRow
                                  key={l.id}
                                  className={selectedId === l.id ? 'bg-primary-soft' : undefined}
                                >
                                  <TableCell className="min-w-40">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedId(l.id)}
                                      aria-pressed={selectedId === l.id}
                                      className="text-start font-semibold text-primary underline-offset-4 hover:underline"
                                    >
                                      {fullName(l.user)}
                                    </button>
                                    <span className="block text-text-muted">{l.user.email}</span>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <span className="case-number">{l.barNumber ?? '—'}</span>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {formatDate(l.registeredAt)}
                                  </TableCell>
                                  <TableCell>
                                    <VerificationBadge status={l.verificationStatus} />
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
                  </div>

                  <div>
                    {selected ? (
                      <LawyerPanel
                        key={selected.id}
                        lawyer={selected}
                        onDone={(m) => {
                          setBanner(m);
                          setSelectedId(null);
                        }}
                      />
                    ) : (
                      <Card>
                        <EmptyState
                          icon={ShieldX}
                          title={t('Select a lawyer')}
                          description={t(
                            'Choose a name from the list to see the submitted credentials.',
                          )}
                        />
                      </Card>
                    )}
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
