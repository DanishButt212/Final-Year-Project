import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Download, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { certificateApi, type Certificate, type SealCheck } from '@/lib/phase5-api';
import { isoToDdMmYyyy } from '@/lib/scheduling-api';

/** The issued certificate's facts with Download PDF and Verify seal. */
export function CertificateDetails({
  cert,
  onDownload,
  onVerify,
}: {
  cert: Certificate;
  onDownload: () => Promise<void>;
  onVerify: () => Promise<SealCheck>;
}) {
  const [check, setCheck] = useState<SealCheck | null>(null);
  const download = useMutation({
    mutationFn: onDownload,
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const verify = useMutation({
    mutationFn: onVerify,
    onSuccess: setCheck,
    onError: (e) => toast.error(parseApiError(e).message),
  });
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Certificate number</dt>
          <dd className="case-number font-semibold">{cert.certificateNo}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Issued</dt>
          <dd>{formatDateTime(cert.issuedAt)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Intern</dt>
          <dd className="font-semibold">{cert.internName}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Supervising lawyer</dt>
          <dd>
            {cert.lawyerName}, {cert.chamberName} ({cert.chamberCode})
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Period</dt>
          <dd>
            {isoToDdMmYyyy(cert.periodFrom)} to {isoToDdMmYyyy(cert.periodTo)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Approved research logs · attendance days</dt>
          <dd>
            {cert.approvedLogs} · {cert.attendanceDays}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-text-muted">Seal (HMAC-SHA256)</dt>
          <dd className="break-all font-mono text-xs">{cert.seal}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button loading={download.isPending} onClick={() => download.mutate()}>
          <Download aria-hidden="true" /> Download PDF certificate
        </Button>
        <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
          <ShieldCheck aria-hidden="true" /> Verify seal
        </Button>
      </div>
      {check && (
        <Alert variant={check.valid ? 'success' : 'error'} title={check.valid ? 'Valid' : 'Tampered'}>
          {check.message}
        </Alert>
      )}
    </div>
  );
}

/** Lawyer's intern page: issue the completion certificate once an approved research log exists. */
export function LawyerCertificateCard({ internId }: { internId: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'intern', internId, 'certificate'],
    queryFn: () => certificateApi.forIntern(internId),
  });
  const issue = useMutation({
    mutationFn: () => certificateApi.issue(internId),
    onSuccess: async (r) => {
      toast.success(r.message);
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: ['chamber', 'intern', internId] });
    },
    onError: (e) => {
      setConfirm(false);
      toast.error(parseApiError(e).message);
    },
  });
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="size-5 text-primary" aria-hidden="true" /> Completion certificate
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
        {isPending ? (
          <Skeleton className="h-20" />
        ) : data?.certificate ? (
          <CertificateDetails
            cert={data.certificate}
            onDownload={() =>
              certificateApi.lawyerDownload(internId, data.certificate!.certificateNo)
            }
            onVerify={() => certificateApi.lawyerVerify(internId)}
          />
        ) : (
          data && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                {data.eligible
                  ? `${data.approvedLogs} approved research log${data.approvedLogs === 1 ? '' : 's'}. The certificate records the period, approved logs and attendance days as of today and cannot be changed later.`
                  : data.message}
              </p>
              <Button disabled={!data.eligible} onClick={() => setConfirm(true)}>
                <Award aria-hidden="true" /> Issue completion certificate
              </Button>
            </div>
          )
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Issue completion certificate"
        description={`Issue the certificate now (${formatDate(new Date())})? It is sealed and cannot be edited or issued a second time.`}
        confirmLabel="Issue certificate"
        loading={issue.isPending}
        onConfirm={() => issue.mutate()}
      />
    </Card>
  );
}
