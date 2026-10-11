import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SealLogo } from '@/components/brand/SealLogo';
import { Wordmark } from '@/components/brand/Wordmark';

/** Timeline in ms (see index.css, ".da-intro"). */
const FLY_AT = 3700;
const FLY_MS = 900;

/**
 * Full-screen seal intro, shown once per browser session on the landing page. The seal stamps down, the
 * stage shakes, two ripples spread, the ring text turns into place, the scales settle, the diamonds pop
 * in and the wordmark rises; then the seal flies (FLIP) onto the header seal while the backdrop fades.
 * "Skip intro" and Escape end it at once. Loaded lazily and never shown under reduced motion.
 */
export default function SealIntro({
  targetRef,
  onDone,
}: {
  /** The header seal the intro seal lands on. */
  targetRef: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'play' | 'fly'>('play');
  const flyRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  useEffect(() => {
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        const el = flyRef.current;
        const target = targetRef.current;
        if (el && target) {
          // FLIP: measure both boxes, then move and scale the intro seal onto the header seal.
          const from = el.getBoundingClientRect();
          const to = target.getBoundingClientRect();
          if (to.width > 0 && from.width > 0) {
            const dx = to.left + to.width / 2 - (from.left + from.width / 2);
            const dy = to.top + to.height / 2 - (from.top + from.height / 2);
            el.style.transition = `transform ${FLY_MS}ms cubic-bezier(.7,0,.25,1)`;
            el.style.transform = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
          }
        }
        setPhase('fly');
      }, FLY_AT),
      window.setTimeout(finish, FLY_AT + FLY_MS + 30),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [finish, targetRef]);

  // Portalled to <body>: ancestors with animations or transforms would otherwise trap it under the header.
  return createPortal(
    <div
      className={`da-intro fixed inset-0 z-[100] ${phase === 'fly' ? 'da-intro-fly' : ''}`}
      data-testid="seal-intro"
    >
      <div className="da-intro-backdrop absolute inset-0 bg-background" aria-hidden="true" />
      <button
        type="button"
        onClick={finish}
        className="absolute end-4 top-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-primary-soft"
      >
        <X className="size-4" aria-hidden="true" />
        {t('Skip intro')}
      </button>
      <div className="da-intro-stage relative flex h-full flex-col items-center justify-center gap-6 px-4">
        <div className="relative">
          <span className="da-intro-ripple da-intro-ripple-1" aria-hidden="true" />
          <span className="da-intro-ripple da-intro-ripple-2" aria-hidden="true" />
          <div ref={flyRef} className="relative will-change-transform">
            <div className="da-intro-stamp">
              <SealLogo size="min(52vw, 15rem)" title={t('DigitalAdaalat seal')} />
            </div>
          </div>
        </div>
        <div className="da-intro-words flex flex-col items-center gap-2 text-center">
          <span className="da-intro-wordmark">
            <Wordmark size={2} />
          </span>
          <span lang="ur" dir="rtl" className="da-intro-urdu urdu-wordmark text-xl text-text-muted">
            ڈیجیٹل عدالت
          </span>
          <span
            className="da-intro-tagline text-xs font-semibold tracking-[0.25em] text-text-muted uppercase"
            dir="ltr"
          >
            Judicial ERP · Pakistan
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
