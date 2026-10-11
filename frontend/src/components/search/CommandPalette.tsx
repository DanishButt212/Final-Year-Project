import { msg } from '@/i18n';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Briefcase,
  History,
  Languages,
  Loader2,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { statusBadge, type CaseStatus } from '@/lib/case-status';
import { PORTALS, portalPath } from '@/lib/navigation';
import { PALETTE_ACTIONS } from '@/lib/palette-actions';
import { STAGE_LABEL, type ProgressStage } from '@/lib/progress';
import { readRecent, recordRecent, type RecentItem } from '@/lib/recent';
import { searchApi, type SearchCase } from '@/lib/search-api';
import type { Role } from '@/lib/types';
import { usePreferences } from '@/preferences/preferences';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/** Highlights the part of `text` that matches `query` (case-insensitive). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < 1) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent-soft text-text">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Where a case opens for each role. */
function casePath(role: Role, id: string) {
  if (role === 'JUDGE') return `/judge/cases/${id}`;
  if (role === 'ADMIN') return `/admin/cases/${id}`;
  return portalPath(PORTALS[role], `cases/${id}`);
}

function stageLabel(stage: ProgressStage | CaseStatus): string {
  return stage in STAGE_LABEL
    ? STAGE_LABEL[stage as ProgressStage]
    : statusBadge(stage as CaseStatus).label;
}

interface PageEntry {
  label: string;
  path: string;
  icon: LucideIcon;
}

/**
 * Global command palette (Ctrl+K / Cmd+K): pages the role can open, the user's own cases from GET /search,
 * role-specific actions and the last opened items. Full keyboard support comes from cmdk; Escape closes it and
 * Radix returns focus to the element that opened it.
 */
export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage } = usePreferences();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  // Read when the palette opens (the list changes only through this palette and case pages).
  const recent = useMemo<RecentItem[]>(
    () => (open && user ? readRecent(user.id) : []),
    [open, user],
  );
  const setOpen = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };

  const search = useQuery({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => searchApi.cases(debounced, signal),
    enabled: open && debounced.length >= MIN_QUERY && Boolean(user),
    staleTime: 30_000,
  });

  const pages = useMemo<PageEntry[]>(() => {
    if (!user) return [];
    const portal = PORTALS[user.role];
    const chamberLocked =
      user.role === 'LAWYER' && user.lawyerProfile?.verificationStatus !== 'VERIFIED';
    return [
      ...portal.items
        .filter((i) => !(chamberLocked && i.group))
        .map((i) => ({ label: i.label, path: portalPath(portal, i.slug), icon: i.icon })),
      { label: msg('My Profile'), path: '/profile', icon: UserCircle },
      { label: msg('Notifications'), path: '/notifications', icon: Bell },
    ];
  }, [user]);

  if (!user) return null;
  const q = query.trim().toLowerCase();
  const matches = (label: string) =>
    !q || t(label).toLowerCase().includes(q) || label.toLowerCase().includes(q);
  const shownPages = pages.filter((p) => matches(p.label));
  const shownActions = PALETTE_ACTIONS[user.role].filter((a) => matches(a.label));
  const cases = search.data ?? [];
  const searching = debounced.length >= MIN_QUERY && search.isFetching;
  const waiting = q.length >= MIN_QUERY && debounced !== query.trim();
  const otherLanguage = language === 'ur' ? 'en' : 'ur';
  // i18n-ignore (each language named in itself)
  const switchLabel = otherLanguage === 'ur' ? 'اردو' : 'English';

  const go = (path: string, item?: RecentItem) => {
    if (item) recordRecent(user.id, item);
    setOpen(false);
    navigate(path);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(26,26,26,0.5)]" />
        <DialogPrimitive.Content
          className="fixed inset-x-0 top-0 z-50 mx-auto flex max-h-dvh w-full flex-col overflow-hidden border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:top-[10vh] sm:max-w-2xl sm:rounded-lg"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t('Search')}</DialogPrimitive.Title>
          <Command shouldFilter={false} loop label={t('Search')}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t('Search cases by UCN or party name, pages and actions…')}
              aria-label={t('Search cases, pages and actions')}
            />
            <CommandList>
              {(searching || waiting) && (
                <p
                  role="status"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('Searching…')}
                </p>
              )}
              {!searching && !waiting && (
                <CommandEmpty>
                  {q.length > 0 && q.length < MIN_QUERY
                    ? t('Type at least 2 characters to search cases.')
                    : t('No results for "{{query}}".', { query: query.trim() })}
                </CommandEmpty>
              )}
              {search.isError && (
                <p role="alert" className="px-3 py-2 text-sm text-destructive">
                  {t('Case search is not available right now.')}{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => void search.refetch()}
                  >
                    {t('Try again')}
                  </button>
                </p>
              )}

              {!q && recent.length > 0 && (
                <CommandGroup heading={t('Recent')}>
                  {recent.map((r) => (
                    <CommandItem
                      key={`recent-${r.path}`}
                      value={`recent-${r.path}`}
                      onSelect={() => go(r.path, r)}
                    >
                      {r.kind === 'case' ? (
                        <Briefcase aria-hidden="true" />
                      ) : (
                        <History aria-hidden="true" />
                      )}
                      {r.kind === 'case' ? (
                        <span className="min-w-0">
                          <span className="case-number block whitespace-nowrap text-sm" dir="ltr">
                            {r.label}
                          </span>
                          {r.detail && (
                            <bdi className="block truncate text-xs text-text-muted">{r.detail}</bdi>
                          )}
                        </span>
                      ) : (
                        <span>{t(r.label)}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {cases.length > 0 && (
                <CommandGroup heading={t('Cases')}>
                  {cases.map((c: SearchCase) => {
                    const path = casePath(user.role, c.id);
                    const parties = c.parties.slice(0, 2).join(' · ');
                    return (
                      <CommandItem
                        key={c.id}
                        value={`case-${c.id}`}
                        onSelect={() =>
                          go(path, { kind: 'case', path, label: c.ucn, detail: c.title })
                        }
                      >
                        <Briefcase aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="case-number block whitespace-nowrap text-sm font-medium" dir="ltr">
                            <Highlight text={c.ucn} query={query} />
                          </span>
                          <bdi className="block truncate text-sm">
                            <Highlight text={c.title} query={query} />
                          </bdi>
                          {parties && (
                            <bdi className="block truncate text-xs text-text-muted">
                              <Highlight text={parties} query={query} />
                            </bdi>
                          )}
                        </span>
                        <Badge variant="neutral" className="shrink-0">
                          {t(stageLabel(c.stage))}
                        </Badge>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {shownActions.length > 0 && (
                <CommandGroup heading={t('Actions')}>
                  {shownActions.map((a) => (
                    <CommandItem
                      key={a.path + a.label}
                      value={`action-${a.label}`}
                      onSelect={() => go(a.path)}
                    >
                      <a.icon aria-hidden="true" />
                      <Highlight text={t(a.label)} query={query} />
                    </CommandItem>
                  ))}
                  {matches(otherLanguage === 'ur' ? msg('Switch to Urdu') : msg('Switch to English')) && (
                    <CommandItem
                      value="action-language"
                      onSelect={() => {
                        setLanguage(otherLanguage);
                        setOpen(false);
                      }}
                    >
                      <Languages aria-hidden="true" />
                      <span>
                        {t(otherLanguage === 'ur' ? msg('Switch to Urdu') : msg('Switch to English'))} (
                        <span lang={otherLanguage}>{switchLabel}</span>)
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}

              {shownPages.length > 0 && (
                <CommandGroup heading={t('Pages')}>
                  {shownPages.map((p) => (
                    <CommandItem
                      key={p.path}
                      value={`page-${p.path}`}
                      onSelect={() => go(p.path, { kind: 'page', path: p.path, label: p.label })}
                    >
                      <p.icon aria-hidden="true" />
                      <Highlight text={t(p.label)} query={query} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          <p className="hidden border-t border-border px-4 py-2 text-xs text-text-muted sm:block">
            {t('↑ ↓ to move · Enter to open · Esc to close')}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
