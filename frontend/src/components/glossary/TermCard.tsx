import { useTranslation } from 'react-i18next';
import { glossaryEntry } from '@/lib/glossary';

/** The explanation inside a <Term> popover (a lazy chunk with all definitions). */
export default function TermCard({ id }: { id: string }) {
  const { t } = useTranslation();
  const entry = glossaryEntry(id);
  if (!entry) return null;
  return (
    <>
      <p className="font-heading font-bold">{t(entry.term)}</p>
      <p className="mt-1 leading-relaxed text-text-muted">{t(entry.definition)}</p>
    </>
  );
}
