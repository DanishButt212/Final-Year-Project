import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Input } from '@/components/ui/input';
import { GLOSSARY } from '@/lib/glossary';
import { cn } from '@/lib/utils';

/** Folds case and Latin accents so "ex parte" matches "Ex parte" and Urdu matches as typed. */
const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Public legal glossary (/glossary): every term with a plain-language explanation, a search box and alphabetical
 * sections in the reader's language. Linked from the landing page, the account menu and every <Term> popover;
 * /glossary#<id> scrolls to and highlights one entry.
 */
export default function GlossaryPage() {
  const { t, i18n } = useTranslation();
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  const lang = i18n.language === 'ur' ? 'ur' : 'en';

  const entries = useMemo(
    () =>
      GLOSSARY.map((g) => ({ ...g, label: t(g.term), text: t(g.definition) })).sort((a, b) =>
        a.label.localeCompare(b.label, lang),
      ),
    [t, lang],
  );
  const q = fold(query.trim());
  const shown = q
    ? entries.filter(
        (e) => fold(e.label).includes(q) || fold(e.text).includes(q) || fold(e.term).includes(q),
      )
    : entries;
  const sections = useMemo(() => {
    const map = new Map<string, typeof shown>();
    for (const e of shown) {
      const letter = e.label.charAt(0).toLocaleUpperCase(lang);
      map.set(letter, [...(map.get(letter) ?? []), e]);
    }
    return [...map.entries()];
  }, [shown, lang]);

  const target = hash.slice(1);
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(`term-${target}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [target]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">{t('Legal glossary')}</h1>
      <p className="mt-2 max-w-2xl text-text-muted">
        {t(
          'Plain-language explanations of the legal and court terms used in DigitalAdaalat. They are a guide, not legal advice.',
        )}
      </p>

      <div className="relative mt-6 max-w-md">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search terms, for example "bail" or "summons"')}
          aria-label={t('Search the glossary')}
          className="ps-10"
        />
      </div>
      <p role="status" className="mt-2 text-sm text-text-muted">
        {q
          ? t('{{n}} of {{total}} terms match.', { n: shown.length, total: entries.length })
          : t('{{total}} terms.', { total: entries.length })}
      </p>

      {sections.length > 0 && (
        <nav aria-label={t('Jump to a letter')} className="mt-4">
          <ul className="flex flex-wrap gap-1">
            {sections.map(([letter]) => (
              <li key={letter}>
                <a
                  href={`#letter-${letter}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`letter-${letter}`)?.scrollIntoView({ block: 'start' });
                  }}
                  className="flex size-10 items-center justify-center rounded-md border border-border bg-surface font-semibold text-primary hover:bg-primary-soft"
                >
                  {letter}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {sections.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
          {t('No term matches "{{query}}".', { query: query.trim() })}
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {sections.map(([letter, items]) => (
            <section key={letter} aria-labelledby={`letter-${letter}`}>
              <h2
                id={`letter-${letter}`}
                className="scroll-mt-24 border-b-2 border-accent pb-1 text-2xl font-bold text-primary"
              >
                {letter}
              </h2>
              <dl className="mt-4 space-y-4">
                {items.map((e) => (
                  <div
                    key={e.id}
                    id={`term-${e.id}`}
                    tabIndex={-1}
                    className={cn(
                      'scroll-mt-24 rounded-lg border border-border bg-surface p-4 outline-none',
                      target === e.id && 'border-primary ring-2 ring-primary/30',
                    )}
                  >
                    <dt className="font-heading text-lg font-bold">{e.label}</dt>
                    <dd className="mt-1 leading-relaxed text-text-muted">{e.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
