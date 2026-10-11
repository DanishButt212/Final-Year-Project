import { Search } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const loadPalette = () => import('./CommandPalette');
const CommandPalette = lazy(loadPalette);

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Header search button with the shortcut hint, plus the global Ctrl+K / Cmd+K shortcut. The palette is a lazy
 * chunk, fetched when the button is hovered or focused, or at the first open.
 */
export function SearchTrigger({ tone = 'inverse' }: { tone?: 'default' | 'inverse' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // i18n-ignore (keyboard key names)
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        data-tour="search"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        onMouseEnter={() => void loadPalette()}
        onFocus={() => void loadPalette()}
        aria-label={t('Search ({{shortcut}})', { shortcut })}
        // i18n-ignore (ARIA key names)
        aria-keyshortcuts={isMac() ? 'Meta+K' : 'Control+K'}
        className={cn(
          'inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-2 text-sm',
          tone === 'inverse'
            ? 'border border-white/50 text-white hover:bg-primary-hover focus-visible:outline-white'
            : 'border border-border text-text hover:bg-primary-soft',
        )}
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden xl:inline">{t('Search')}</span>
        <kbd
          aria-hidden="true"
          dir="ltr"
          className={cn(
            'hidden rounded border px-1.5 font-sans text-xs lg:inline',
            tone === 'inverse' ? 'border-white/40 text-white/85' : 'border-border text-text-muted',
          )}
        >
          {shortcut}
        </kbd>
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <CommandPalette open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
