import { LayoutDashboard, LogIn, Menu, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { FontSizeControl, LanguageToggle } from '@/components/preferences/PreferenceControls';
import { Button } from '@/components/ui/button';
import { msg } from '@/i18n';
import { roleHome } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';

/** What the landing page needs from the layout to fly its intro seal onto the header seal. */
export interface PublicOutletContext {
  sealRef: RefObject<HTMLSpanElement | null>;
  setSealHidden: (hidden: boolean) => void;
}

const NAV = [
  { to: { pathname: '/', hash: '#features' }, label: msg('Features') },
  { to: { pathname: '/', hash: '#case-status' }, label: msg('Case Status') },
  { to: { pathname: '/', hash: '#how-it-works' }, label: msg('How It Works') },
  { to: { pathname: '/glossary' }, label: msg('Glossary') },
];

function AccountButtons({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (user) {
    return (
      <Button asChild size="sm">
        <Link to={roleHome(user.role)}>
          <LayoutDashboard aria-hidden="true" /> {t('My dashboard')}
        </Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="secondary" size="sm" className={compact ? 'flex-1' : undefined}>
        <Link to="/login">
          <LogIn aria-hidden="true" className="rtl:-scale-x-100" /> {t('Sign in')}
        </Link>
      </Button>
      <Button asChild size="sm" className={compact ? 'flex-1' : undefined}>
        <Link to="/register">
          <UserPlus aria-hidden="true" /> {t('Register')}
        </Link>
      </Button>
    </>
  );
}

function PublicHeader({
  sealRef,
  sealHidden,
}: {
  sealRef: RefObject<HTMLSpanElement | null>;
  sealHidden: boolean;
}) {
  const { t } = useTranslation();
  const { pathname, hash } = useLocation();
  // The menu belongs to the location it was opened on, so any navigation (hash links too) closes it.
  const here = `${pathname}${hash}`;
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === here;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenAt((typeof next === 'function' ? next(open) : next) ? here : null);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenAt(null);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo to="/" tone="default" sealSize={44} urdu sealRef={sealRef} sealHidden={sealHidden} />
        <nav aria-label={t('Main')} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-text no-underline hover:bg-primary-soft hover:text-primary"
                >
                  {t(item.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <LanguageToggle />
          <FontSizeControl />
          <AccountButtons />
        </div>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? t('Close menu') : t('Open menu')}
          onClick={() => setOpen((o) => !o)}
          className="flex size-11 items-center justify-center rounded-md border border-border text-text hover:bg-primary-soft lg:hidden"
        >
          {open ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      <div
        id={menuId}
        hidden={!open}
        className="border-t border-border bg-surface px-4 pb-4 lg:hidden"
      >
        <nav aria-label={t('Main')}>
          <ul className="py-2">
            {NAV.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-2 font-medium text-text no-underline hover:bg-primary-soft"
                >
                  {t(item.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <LanguageToggle />
          <FontSizeControl />
        </div>
        <div className="mt-3 flex gap-2">
          <AccountButtons compact />
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <footer className="no-print border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          {/* i18n-ignore */}
          <bdi dir="ltr">DigitalAdaalat</bdi> · {t('Final Year Project')} ·{' '}
          {t('Air University, Multan Campus')}
        </p>
        <nav aria-label={t('Footer')}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            <li>
              <Link to="/glossary" className="inline-flex min-h-11 items-center">
                {t('Legal glossary')}
              </Link>
            </li>
            {!user && (
              <>
                <li>
                  <Link to="/login" className="inline-flex min-h-11 items-center">
                    {t('Sign in')}
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="inline-flex min-h-11 items-center">
                    {t('Register')}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-text-muted">
        {t(
          'DigitalAdaalat is a final year academic project. It is not an official government or court service.',
        )}
      </p>
    </footer>
  );
}

/** Layout for guests: landing, case status, glossary, login, register and password pages. */
export function PublicLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const sealRef = useRef<HTMLSpanElement>(null);
  const [sealHidden, setSealHiddenState] = useState(false);
  const setSealHidden = useCallback((hidden: boolean) => setSealHiddenState(hidden), []);
  const context: PublicOutletContext = { sealRef, setSealHidden };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:text-primary"
      >
        {t('Skip to main content')}
      </a>
      <PublicHeader sealRef={sealRef} sealHidden={sealHidden} />
      <main
        id="main"
        tabIndex={-1}
        className={cn('flex-1 outline-none', 'da-page-enter')}
        key={pathname}
      >
        <Outlet context={context} />
      </main>
      <PublicFooter />
    </div>
  );
}
