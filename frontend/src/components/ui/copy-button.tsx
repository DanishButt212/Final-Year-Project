import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path (insecure origin or denied permission)
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copies a code (UCN, challan, receipt, certificate or chamber number) and confirms with "Copied" for
 * two seconds; the confirmation is announced to screen readers.
 */
export function CopyButton({
  value,
  label,
  className,
  size = 'sm',
}: {
  value: string;
  /** Accessible name, e.g. "Copy UCN". */
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    const ok = await writeClipboard(value);
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label ?? t('Copy')}
        title={label ?? t('Copy')}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-surface font-medium text-text hover:bg-primary-soft hover:text-primary',
          size === 'sm' ? 'min-h-9 min-w-9 px-2 text-xs' : 'min-h-10 min-w-10 px-3 text-sm',
          className,
        )}
      >
        {state === 'copied' ? (
          <Check className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {state === 'copied' && <span aria-hidden="true">{t('Copied')}</span>}
      </button>
      <span className="sr-only" role="status">
        {state === 'copied'
          ? t('Copied')
          : state === 'failed'
            ? t('Could not copy. Select the text and copy it.')
            : ''}
      </span>
    </>
  );
}
