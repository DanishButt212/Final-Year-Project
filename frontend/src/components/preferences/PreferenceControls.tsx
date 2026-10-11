import { useTranslation } from 'react-i18next';
import { FONT_SCALES, usePreferences } from '@/preferences/preferences';
import type { Language } from '@/i18n';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'inverse';

const groupClass = (tone: Tone) =>
  cn(
    'inline-flex shrink-0 items-center rounded-md border p-0.5',
    tone === 'inverse' ? 'border-white/50' : 'border-border bg-surface',
  );

const itemClass = (tone: Tone, active: boolean) =>
  cn(
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    tone === 'inverse'
      ? active
        ? 'bg-white text-primary'
        : 'text-white hover:bg-primary-hover focus-visible:outline-white'
      : active
        ? 'bg-primary text-on-primary'
        : 'text-text hover:bg-primary-soft',
  );

const OPTIONS: { lng: Language; label: string }[] = [
  // i18n-ignore
  { lng: 'en', label: 'English' },
  { lng: 'ur', label: 'اردو' },
];

/** "English | اردو". Each option is written in its own language so it is recognisable in either UI. */
export function LanguageToggle({
  tone = 'default',
  className,
}: {
  tone?: Tone;
  className?: string;
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = usePreferences();
  return (
    <div
      role="group"
      aria-label={t('Language')}
      className={cn(groupClass(tone), className)}
      data-tour="preferences"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.lng}
          type="button"
          lang={o.lng}
          dir={o.lng === 'ur' ? 'rtl' : 'ltr'}
          aria-pressed={language === o.lng}
          onClick={() => setLanguage(o.lng)}
          className={cn(itemClass(tone, language === o.lng), o.lng === 'ur' && 'urdu-control')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A-  A  A+ : three root font-size steps (100 %, 112.5 %, 125 %). */
export function FontSizeControl({
  tone = 'default',
  className,
}: {
  tone?: Tone;
  className?: string;
}) {
  const { t } = useTranslation();
  const { fontScale, setFontScale } = usePreferences();
  const index = FONT_SCALES.indexOf(fontScale);
  const percent = `${Math.round(fontScale * 1000) / 10}%`;
  return (
    <div
      role="group"
      aria-label={t('Text size')}
      className={cn(groupClass(tone), className)}
      dir="ltr"
    >
      <button
        type="button"
        aria-label={t('Decrease text size')}
        disabled={index <= 0}
        onClick={() => setFontScale(FONT_SCALES[index - 1])}
        className={itemClass(tone, false)}
      >
        <span aria-hidden="true" className="text-xs">
          A−
        </span>
      </button>
      <button
        type="button"
        aria-label={t('Default text size')}
        aria-pressed={index === 0}
        onClick={() => setFontScale(FONT_SCALES[0])}
        className={itemClass(tone, false)}
      >
        <span aria-hidden="true">A</span>
      </button>
      <button
        type="button"
        aria-label={t('Increase text size')}
        disabled={index >= FONT_SCALES.length - 1}
        onClick={() => setFontScale(FONT_SCALES[index + 1])}
        className={itemClass(tone, false)}
      >
        <span aria-hidden="true" className="text-base">
          A+
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {t('Text size {{percent}}', { percent })}
      </span>
    </div>
  );
}
