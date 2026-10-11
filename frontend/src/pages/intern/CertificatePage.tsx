import { QueryError } from '@/components/ui/query-error';
import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { certificateApi } from '@/lib/phase5-api';
import { CertificateDetails } from './CertificateCard';
import { useTranslation } from 'react-i18next';

/** Intern "Certificate": view, download and verify the completion certificate once the lawyer issues it. */
export default function CertificatePage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['intern', 'certificate'],
    queryFn: certificateApi.mine,
  });
  return (
    <>
      <PageHeader
        title={t('Completion Certificate')}
        description={t(
          'Your internship completion certificate, issued by your supervising lawyer.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/intern' }, { label: t('Certificate') }]}
      />
      {isError && <QueryError error={error} />}
      {isPending ? (
        <Skeleton className="h-48" />
      ) : data?.certificate ? (
        <Card className="max-w-3xl">
          <CardContent>
            <CertificateDetails
              cert={data.certificate}
              previewPath="/intern/certificate/pdf"
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
              title={data.message ?? t('No certificate yet.')}
              description={t(
                'Your lawyer can issue it once at least one of your research logs is approved.',
              )}
            />
          </Card>
        )
      )}
    </>
  );
}
