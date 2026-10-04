import { useQuery } from '@tanstack/react-query';
import { Building2, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { chamberApi } from '@/lib/chamber-api';

/** Small dashboard card with the Chamber ID and a copy button. */
export function ChamberIdCard() {
  const { data } = useQuery({
    queryKey: ['chamber', 'profile'],
    queryFn: chamberApi.profile,
    retry: false,
  });
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm text-text-muted">{data.name} · Chamber ID</p>
            <p className="case-number text-lg font-semibold">{data.chamberCode}</p>
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
              toast.error('Could not copy. Select the Chamber ID and copy it manually.');
            }
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy Chamber ID'}
        </Button>
      </CardContent>
    </Card>
  );
}
