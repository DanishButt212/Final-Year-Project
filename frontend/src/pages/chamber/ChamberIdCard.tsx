import { CopyButton } from '@/components/ui/copy-button';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { chamberApi } from '@/lib/chamber-api';
import { useTranslation } from 'react-i18next';

/** Small dashboard card with the Chamber ID and a copy button. */
export function ChamberIdCard() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['chamber', 'profile'],
    queryFn: chamberApi.profile,
    retry: false,
  });
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  return (
    <Card className="mb-6" data-tour="chamber-id">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm text-text-muted">
              {t('{{name}} · Chamber ID', { name: data.name })}
            </p>
            <p className="flex items-center gap-2">
              <span className="case-number text-lg font-semibold">{data.chamberCode}</span>
              <CopyButton value={data.chamberCode} label={t('Copy chamber ID')} />
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(data.chamberCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error(t('Could not copy. Select the Chamber ID and copy it manually.'));
            }
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t('Copied') : t('Copy Chamber ID')}
        </Button>
      </CardContent>
    </Card>
  );
}
