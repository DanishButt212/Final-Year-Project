import { Search } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { UCN_FORMAT_MESSAGE, UCN_REGEX } from '@/lib/public-api';
import { cn } from '@/lib/utils';

/**
 * Public case status lookup: one UCN field (monospace, upper-cased as you type) that opens /status/:ucn.
 * The format is checked here first, so obviously wrong input never reaches the rate-limited API.
 */
export function CaseStatusLookup({
  initial = '',
  className,
  headingLevel = 'h2',
  compact = false,
}: {
  initial?: string;
  className?: string;
  headingLevel?: 'h2' | 'h3';
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const headingId = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const Heading = headingLevel;

  function submit(e: FormEvent) {
    e.preventDefault();
    const ucn = value.trim().toUpperCase();
    if (!UCN_REGEX.test(ucn)) {
      setError(t(UCN_FORMAT_MESSAGE));
      return;
    }
    setError(null);
    navigate(`/status/${ucn}`);
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn('rounded-lg border border-border bg-surface p-5 shadow-sm', className)}
    >
      <Heading id={headingId} className={cn('font-bold', compact ? 'text-base' : 'text-lg')}>
        {t('Check case status')}
      </Heading>
      {!compact && (
        <p className="mt-1 text-sm text-text-muted">
          {t('Enter the Unique Case Number printed on your filing receipt. No sign-in needed.')}
        </p>
      )}
      <form onSubmit={submit} noValidate className="mt-4 space-y-3">
        <Field label={t('Unique Case Number (UCN)')} error={error ?? undefined} required>
          {(control) => (
            <Input
              {...control}
              dir="ltr"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="DA-2026-CIV-000001"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={24}
              className="case-number text-start uppercase tracking-wide"
            />
          )}
        </Field>
        <Button type="submit" className="w-full">
          <Search aria-hidden="true" /> {t('Check status')}
        </Button>
      </form>
    </section>
  );
}
