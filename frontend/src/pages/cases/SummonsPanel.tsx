import { useQuery } from '@tanstack/react-query';
import { Download, ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
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
import { formatDate, formatDateTime } from '@/lib/format';
import { caseSummonsApi } from '@/lib/summons-api';
import { OverdueBadge, SummonsStatusBadge } from '@/pages/server/badges';

function JudgeImage({
  id,
  kind,
  label,
}: {
  id: string;
  kind: 'photo' | 'signature';
  label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    caseSummonsApi
      .proofImage(id, kind)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, kind]);
  return url ? (
    <figure>
      <img
        src={url}
        alt={label}
        className="max-h-40 rounded-md border border-border bg-white object-contain"
      />
      <figcaption className="text-xs text-text-muted">{label}</figcaption>
    </figure>
  ) : null;
}

/** Read-only summons of a case. Filers and lawyers see status and outcome notes; the judge also sees the proof. */
export default function SummonsPanel({
  caseId,
  ucn,
  judge = false,
}: {
  caseId: string;
  ucn: string;
  judge?: boolean;
}) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['case-summons', caseId],
    queryFn: () => caseSummonsApi.list(caseId),
  });

  if (isPending) return <Skeleton className="h-40" />;
  if (isError) return <Alert variant="error">{parseApiError(error).message}</Alert>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ScrollText}
          title="No summons or notices"
          description="Summons and notices issued by the court registry for this case appear here."
        />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Table aria-label="Summons and notices">
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
            <TableHead>Last attempt</TableHead>
            <TableHead>Executed</TableHead>
            <TableHead>Proof</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <p className="font-medium">{s.recipientName}</p>
                {s.attempts.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm text-text-muted">
                    {s.attempts.map((a) => (
                      <li key={a.id}>
                        {formatDateTime(a.createdAt)}: {a.notes}
                      </li>
                    ))}
                  </ul>
                )}
                {judge && s.serviceAddress && (
                  <p className="mt-1 text-sm text-text-muted">{s.serviceAddress}</p>
                )}
              </TableCell>
              <TableCell>{s.noticeType === 'NOTICE' ? 'Notice' : 'Summons'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <SummonsStatusBadge status={s.status} />
                  <OverdueBadge overdue={s.overdue} />
                </div>
              </TableCell>
              <TableCell className="text-right">{s.attemptCount}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(s.lastAttemptAt)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(s.executedAt)}</TableCell>
              <TableCell>
                {s.hasProof ? (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        caseSummonsApi
                          .downloadProof(s.id, ucn)
                          .catch((e) => toast.error(parseApiError(e).message))
                      }
                    >
                      <Download aria-hidden="true" /> Download Proof of Service
                    </Button>
                    {judge && s.proof && (
                      <>
                        <p className="text-xs text-text-muted">
                          {s.server?.name} ({s.server?.badgeNumber}) · {s.proof.latitude},{' '}
                          {s.proof.longitude} (±
                          {Math.round(Number(s.proof.accuracyM))} m)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {s.proof.hasPhoto && <JudgeImage id={s.id} kind="photo" label="Photo" />}
                          {s.proof.hasSignature && (
                            <JudgeImage id={s.id} kind="signature" label="Signature" />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
