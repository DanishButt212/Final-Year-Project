import {
  Briefcase,
  FileCheck2,
  Gavel,
  GraduationCap,
  Landmark,
  Lock,
  LogIn,
  ScrollText,
  ShieldCheck,
  Stamp,
  User,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useOutletContext } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { CaseProgress } from '@/components/case/CaseProgress';
import SealIntro from '@/components/intro/SealIntro';
import { CaseStatusLookup } from '@/components/landing/CaseStatusLookup';
import type { PublicOutletContext } from '@/components/layout/PublicLayout';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { useReveal } from '@/hooks/use-reveal';
import { msg } from '@/i18n';
import { roleHome } from '@/lib/navigation';
import { EXAMPLE_PROGRESS, PROGRESS_STAGES, STAGE_LABEL } from '@/lib/progress';
import { cn } from '@/lib/utils';

const INTRO_KEY = 'da_intro_seen';
/** Fallback when sessionStorage is blocked: once per page load. */
let introShownThisLoad = false;

function shouldPlayIntro(): boolean {
  if (introShownThisLoad) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem(INTRO_KEY) !== '1';
  } catch {
    return true;
  }
}

function markIntroSeen() {
  introShownThisLoad = true;
  try {
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    // storage unavailable: the module flag above still prevents a replay on this page load
  }
}

const ROLES: { icon: LucideIcon; title: string; summary: string; points: string[] }[] = [
  {
    icon: User,
    title: msg('Litigant'),
    summary: msg('File and follow your own cases.'),
    points: [
      msg('File a case online with PDF pleadings and receive a Unique Case Number'),
      msg('Generate the court fee challan, pay online and keep your receipts'),
      msg('Track hearings and cause lists, and join virtual hearings'),
    ],
  },
  {
    icon: Briefcase,
    title: msg('Lawyer'),
    summary: msg('Your practice and your chamber in one place.'),
    points: [
      msg('File and manage cases for your clients'),
      msg('Record billable hours, retainers and chamber expenses'),
      msg('Supervise interns and review their research logs'),
    ],
  },
  {
    icon: GraduationCap,
    title: msg('Legal Intern'),
    summary: msg('Learn in chambers with a verified record.'),
    points: [
      msg('Write daily research logs for your supervisor to review'),
      msg('Mark geo-fenced attendance at the court complex'),
      msg('Download a sealed completion certificate'),
    ],
  },
  {
    icon: ScrollText,
    title: msg('Process Server'),
    summary: msg('Serve summons with proof that holds up.'),
    points: [
      msg('See your duty roster on any phone'),
      msg('Record each attempt with its GPS location'),
      msg('Finalise service with a photo and signature, sealed against tampering'),
    ],
  },
  {
    icon: Gavel,
    title: msg('Judge'),
    summary: msg('Hear and decide cases on time.'),
    points: [
      msg('See your weekly schedule and the daily cause list'),
      msg('Record hearing outcomes and adjournments'),
      msg('Decide cases and record the final order'),
    ],
  },
  {
    icon: Landmark,
    title: msg('Administrator'),
    summary: msg('Run the court registry with full oversight.'),
    points: [
      msg('Allocate cases to judges at random or by hand'),
      msg('Schedule benches without clashes and publish cause lists'),
      msg('Follow analytics, the audit trail and security alerts'),
    ],
  },
];

const STEP_TEXT: Record<(typeof PROGRESS_STAGES)[number], string> = {
  FILED: msg('The case is filed online with its pleadings and receives a UCN.'),
  FEE_PAID: msg('The court fee challan is paid online and a receipt is issued.'),
  ALLOCATED: msg('The registry allocates the case to a court, bench and judge.'),
  HEARING: msg('Hearings are fixed without clashes and appear on the cause list.'),
  DECIDED: msg('The judge records the decision and the final order.'),
};

const TRUST: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Lock,
    title: msg('Encrypted evidence'),
    text: msg(
      'Exhibits are encrypted at rest and checked against their fingerprint on every download.',
    ),
  },
  {
    icon: FileCheck2,
    title: msg('Tamper-evident audit trail'),
    text: msg(
      'Every important action is hashed into an audit log that cannot be edited or deleted.',
    ),
  },
  {
    icon: Stamp,
    title: msg('Sealed documents'),
    text: msg(
      'Receipts, certificates, reports and proofs of service carry a seal that anyone can verify.',
    ),
  },
  {
    icon: ShieldCheck,
    title: msg('Role-based access'),
    text: msg('Each person sees only what their role and their own cases allow.'),
  },
];

function Reveal({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref as never} className={cn('da-reveal', className)}>
      {children}
    </Tag>
  );
}

/** Scrolls to #section links (header and footer) and moves focus there for keyboard users. */
function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [hash]);
}

export default function LandingPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const outlet = useOutletContext<PublicOutletContext | undefined>();
  const [eligible] = useState(shouldPlayIntro);
  const [introDone, setIntroDone] = useState(false);
  // Plays once auth is known: never for signed-in users, only on "/" itself.
  const playing = eligible && !introDone && !loading && !user;
  const holdingForStartup = eligible && !introDone && !user;
  useHashScroll();

  useEffect(() => {
    if (playing) markIntroSeen();
    outlet?.setSealHidden(playing);
  }, [playing, outlet]);

  const endIntro = useCallback(() => setIntroDone(true), []);

  if (user) return <Navigate to={roleHome(user.role)} replace />;

  return (
    <>
      {holdingForStartup && !playing && (
        <div
          className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-background"
          role="status"
          aria-label={t('Loading DigitalAdaalat')}
        >
          <div className="flex flex-col items-center gap-4">
            <Logo to="/" tone="default" sealSize={88} />
            <span className="text-sm font-semibold tracking-[0.2em] text-text-muted uppercase">
              {t('Judicial ERP · Pakistan')}
            </span>
          </div>
        </div>
      )}

      {playing && outlet && <SealIntro targetRef={outlet.sealRef} onDone={endIntro} />}

      <div
        aria-hidden={holdingForStartup ? true : undefined}
        style={holdingForStartup ? { visibility: 'hidden' } : undefined}
      >
        <section className="border-b border-border bg-surface">
          <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[1fr_24rem] lg:gap-12">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Landmark className="size-4" aria-hidden="true" />
                <span>{t('Judicial ERP for the courts of Pakistan')}</span>
              </p>
              <h1 className="mt-3 max-w-2xl text-3xl font-bold sm:text-4xl lg:text-5xl">
                {t("Pakistan's courts, now digital.")}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-text-muted">
                {t(
                  'File cases, pay court fees, track hearings and attend virtual hearings online, from anywhere in Pakistan.',
                )}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/register">
                    <UserPlus aria-hidden="true" /> {t('Register')}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/login">
                    <LogIn aria-hidden="true" className="rtl:-scale-x-100" /> {t('Sign in')}
                  </Link>
                </Button>
              </div>
            </div>
            <div id="case-status" tabIndex={-1} className="scroll-mt-24 outline-none">
              <CaseStatusLookup />
            </div>
          </div>
        </section>

        <section
          id="features"
          tabIndex={-1}
          aria-labelledby="features-heading"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 outline-none"
        >
          <h2 id="features-heading" className="text-2xl font-bold">
            {t('Built for everyone in the courtroom')}
          </h2>
          <p className="mt-2 max-w-2xl text-text-muted">
            {t('Six portals, one system: each role sees the tools it needs and nothing more.')}
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map(({ icon: Icon, title, summary, points }) => (
              <Reveal as="li" key={title}>
                <article className="h-full rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-base font-bold">{t(title)}</h3>
                  </div>
                  <p className="mt-3 text-sm font-medium text-text">{t(summary)}</p>
                  <ul className="mt-3 space-y-2 text-sm text-text-muted">
                    {points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                        />
                        <span>{t(p)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </ul>
        </section>

        <section
          id="how-it-works"
          tabIndex={-1}
          aria-labelledby="how-heading"
          className="scroll-mt-20 border-y border-border bg-surface outline-none"
        >
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 id="how-heading" className="text-2xl font-bold">
              {t('How it works')}
            </h2>
            <p className="mt-2 max-w-2xl text-text-muted">
              {t(
                'Every case moves through the same five stages, and you can follow each one online.',
              )}
            </p>
            <Reveal className="mt-8">
              <CaseProgress progress={EXAMPLE_PROGRESS} staticExample headingId="how-heading" />
            </Reveal>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {PROGRESS_STAGES.map((stage, i) => (
                <Reveal as="li" key={stage} className="rounded-md border border-border p-4">
                  <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                    {t('Step {{n}}', { n: i + 1 })}
                  </p>
                  <h3 className="mt-1 text-base font-bold">{t(STAGE_LABEL[stage])}</h3>
                  <p className="mt-1 text-sm text-text-muted">{t(STEP_TEXT[stage])}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="trust-heading" className="mx-auto max-w-6xl px-4 py-12">
          <h2 id="trust-heading" className="text-2xl font-bold">
            {t('Security you can verify')}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <Reveal as="li" key={title} className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-bold">{t(title)}</h3>
                  <p className="mt-1 text-sm text-text-muted">{t(text)}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
