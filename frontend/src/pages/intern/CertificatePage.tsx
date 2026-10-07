import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { certificateApi } from '@/lib/phase5-api';
import { CertificateDetails } from './CertificateCard';

/** Intern "Certificate": view, download and verify the completion certificate once the lawyer issues it. */
export default function CertificatePage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['intern', 'certificate'],
    queryFn: certificateApi.mine,
  });
  return (
    <>
      <PageHeader
        title="Completion Certificate"
        description="Your internship completion certificate, issued by your supervising lawyer."
        crumbs={[{ label: 'Dashboard', to: '/intern' }, { label: 'Certificate' }]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-48" />
      ) : data?.certificate ? (
        <Card className="max-w-3xl">
          <CardContent>
            <CertificateDetails
              cert={data.certificate}
              onDownload={() => certificateApi.download(data.certificate!.certificateNo)}
              onVerify={certificateApi.verify}
            />
          </CardContent>
        </Card>
      ) : (
        data && (
          <Card className="max-w-3xl">
            <EmptyState
              icon={Award}
              title={data.message ?? 'No certificate yet.'}
              description="Your lawyer can issue it once at least one of your research logs is approved."
            />
          </Card>
        )
      )}
    </>
  );
}
