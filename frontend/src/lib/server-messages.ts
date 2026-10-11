import i18n, { msg } from '@/i18n';
import { ltr } from './format';

/**
 * Central map of every English message the API can send. The API stays in English; the client shows the
 * message in the reader's language:
 *  1. a static message is looked up as a translation key (all of them are registered below, so the
 *     extractor puts them in the "errors" catalogue);
 *  2. a dynamic message (case history lines, report results) is matched against PATTERNS and rendered from
 *     its template with the captured values;
 *  3. anything unknown is shown as the server sent it.
 * `npm run i18n:server` (scripts/server-messages.mjs) lists API messages that are missing here.
 */
// The static messages are listed in server-messages.catalog.ts (read by the extractor only, never bundled).


interface Pattern {
  re: RegExp;
  key: string;
  names: string[];
}

const p = (re: RegExp, key: string, ...names: string[]): Pattern => ({ re, key, names });

/** Dynamic messages: regex over the English text -> template key and the names of its captures. */
const PATTERNS: Pattern[] = [
  p(
    /^Case submitted as (\S+) and pending assignment to a judge\.$/,
    msg('Case submitted as {{ucn}} and pending assignment to a judge.'),
    'ucn',
  ),
  p(/^Document attached: (.+)$/, msg('Document attached: {{name}}'), 'name'),
  p(
    /^Case allocated to (.+?), ([^,]+), ([^,]+)\.$/,
    msg('Case allocated to {{judge}}, {{court}}, {{courtroom}}.'),
    'judge',
    'court',
    'courtroom',
  ),
  p(
    /^Case allocated to (.+?), ([^,]+)\.$/,
    msg('Case allocated to {{judge}}, {{court}}.'),
    'judge',
    'court',
  ),
  p(
    /^Case re-allocated to (.+?), ([^,]+), ([^,(]+) \(previously (.+)\)\.$/,
    msg('Case re-allocated to {{judge}}, {{court}}, {{courtroom}} (previously {{previous}}).'),
    'judge',
    'court',
    'courtroom',
    'previous',
  ),
  p(
    /^Case re-allocated to (.+?), ([^,(]+) \(previously (.+)\)\.$/,
    msg('Case re-allocated to {{judge}}, {{court}} (previously {{previous}}).'),
    'judge',
    'court',
    'previous',
  ),
  p(
    /^Case (\S+) allocated to (.+)\.$/,
    msg('Case {{ucn}} allocated to {{judge}}.'),
    'ucn',
    'judge',
  ),
  p(
    /^Completion certificate (\S+) issued\.$/,
    msg('Completion certificate {{certificateNo}} issued.'),
    'certificateNo',
  ),
  p(
    /^1 exhibit locked by order of the bench\. Reason: (.*)$/s,
    msg('1 exhibit locked by order of the bench. Reason: {{reason}}'),
    'reason',
  ),
  p(
    /^(\d+) exhibits locked by order of the bench\. Reason: (.*)$/s,
    msg('{{count}} exhibits locked by order of the bench. Reason: {{reason}}'),
    'count',
    'reason',
  ),
  p(/^1 exhibit locked by order of the bench\.$/, msg('1 exhibit locked by order of the bench.')),
  p(
    /^(\d+) exhibits locked by order of the bench\.$/,
    msg('{{count}} exhibits locked by order of the bench.'),
    'count',
  ),
  p(
    /^1 digital exhibit added to the vault \((.+)\)\.$/,
    msg('1 digital exhibit added to the vault ({{category}}).'),
    'category',
  ),
  p(
    /^(\d+) digital exhibits added to the vault \((.+)\)\.$/,
    msg('{{count}} digital exhibits added to the vault ({{category}}).'),
    'count',
    'category',
  ),
  p(/^Each file must be under (\d+)MB\.$/, msg('Each file must be under {{size}}MB.'), 'size'),
  p(
    /^You can send up to (\d+) feedback messages per hour\. Please try again later\.$/,
    msg('You can send up to {{count}} feedback messages per hour. Please try again later.'),
    'count',
  ),
  p(
    /^Claim value fee \((.+)% of (.+), capped at (.+)\)$/,
    msg('Claim value fee ({{percent}}% of {{claim}}, capped at {{cap}})'),
    'percent',
    'claim',
    'cap',
  ),
  p(/^Rate modifier \((.+)%\)$/, msg('Rate modifier ({{percent}}%)'), 'percent'),
  p(/^Court fee for (.+) \(filing\)$/, msg('Court fee for {{caseType}} (filing)'), 'caseType'),
  p(
    /^Court fee of PKR (\S+) received \(challan (\S+), receipt (\S+)\)\.$/,
    msg('Court fee of PKR {{amount}} received (challan {{challanNo}}, receipt {{receiptNo}}).'),
    'amount',
    'challanNo',
    'receiptNo',
  ),
  p(
    /^1 future hearing cancelled because the case was decided\.$/,
    msg('1 future hearing cancelled because the case was decided.'),
  ),
  p(
    /^(\d+) future hearings cancelled because the case was decided\.$/,
    msg('{{count}} future hearings cancelled because the case was decided.'),
    'count',
  ),
  p(
    /^1 exhibit locked because the case was decided\.$/,
    msg('1 exhibit locked because the case was decided.'),
  ),
  p(
    /^(\d+) exhibits locked because the case was decided\.$/,
    msg('{{count}} exhibits locked because the case was decided.'),
    'count',
  ),
  p(/^Case decided: (.+)\.$/, msg('Case decided: {{decision}}.'), 'decision'),
  p(
    /^Hearing of (.+?) adjourned\. Order notes: (.*)$/s,
    msg('Hearing of {{when}} adjourned. Order notes: {{notes}}'),
    'when',
    'notes',
  ),
  p(
    /^Hearing of (.+?) completed\. Order notes: (.*)$/s,
    msg('Hearing of {{when}} completed. Order notes: {{notes}}'),
    'when',
    'notes',
  ),
  p(
    /^Hearing of (.+?) cancelled\. Reason: (.*)$/s,
    msg('Hearing of {{when}} cancelled. Reason: {{reason}}'),
    'when',
    'reason',
  ),
  p(
    /^Summons for (.+) cancelled because the case was decided\.$/,
    msg('Summons for {{recipient}} cancelled because the case was decided.'),
    'recipient',
  ),
  p(
    /^Summons for (.+) cancelled by the registry\.$/,
    msg('Summons for {{recipient}} cancelled by the registry.'),
    'recipient',
  ),
  p(
    /^Summons for (.+) reassigned to another process server\.$/,
    msg('Summons for {{recipient}} reassigned to another process server.'),
    'recipient',
  ),
  p(
    /^Summons for (.+) assigned to a process server\.$/,
    msg('Summons for {{recipient}} assigned to a process server.'),
    'recipient',
  ),
  p(/^Summons issued to (.+)\.$/, msg('Summons issued to {{recipient}}.'), 'recipient'),
  p(/^Notice issued to (.+)\.$/, msg('Notice issued to {{recipient}}.'), 'recipient'),
  p(
    /^Service attempt on (.+?): (.*)$/s,
    msg('Service attempt on {{recipient}}: {{notes}}'),
    'recipient',
    'notes',
  ),
  p(
    /^Summons to (.+) executed \(delivered in person\)\.$/,
    msg('Summons to {{recipient}} executed (delivered in person).'),
    'recipient',
  ),
  p(
    /^Summons to (.+) executed \(refused, affixed to gate\)\.$/,
    msg('Summons to {{recipient}} executed (refused, affixed to gate).'),
    'recipient',
  ),
  p(
    /^Virtual hearing scheduled for (.+) in (.+) before (.+)\.$/,
    msg('Virtual hearing scheduled for {{when}} in {{courtroom}} before {{judge}}.'),
    'when',
    'courtroom',
    'judge',
  ),
  p(
    /^Hearing scheduled for (.+) in (.+) before (.+)\.$/,
    msg('Hearing scheduled for {{when}} in {{courtroom}} before {{judge}}.'),
    'when',
    'courtroom',
    'judge',
  ),
  p(
    /^Hearing scheduled for (\d{2}-\d{2}-\d{4}) at (\S+) in (.+)\.$/,
    msg('Hearing scheduled for {{date}} at {{time}} in {{courtroom}}.'),
    'date',
    'time',
    'courtroom',
  ),
  p(
    /^Hearing moved from (\d{2}-\d{2}-\d{4}) at (\S*) to (.+) in (.+) before (.+)\.$/,
    msg(
      'Hearing moved from {{fromDate}} at {{fromTime}} to {{when}} in {{courtroom}} before {{judge}}.',
    ),
    'fromDate',
    'fromTime',
    'when',
    'courtroom',
    'judge',
  ),
  p(/^(\d+) hearing\(s\) scheduled\.$/, msg('{{count}} hearing(s) scheduled.'), 'count'),
  p(
    /^Virtual courtroom session opened for the hearing on (.+)\.$/,
    msg('Virtual courtroom session opened for the hearing on {{when}}.'),
    'when',
  ),
  p(
    /^Virtual courtroom session for the hearing on (\S+) ended\.$/,
    msg('Virtual courtroom session for the hearing on {{date}} ended.'),
    'date',
  ),
  p(/^Audio input muted: (.+)\.$/, msg('Audio input muted: {{name}}.'), 'name'),
  p(/^Video broadcast disabled: (.+)\.$/, msg('Video broadcast disabled: {{name}}.'), 'name'),
  p(
    /^Participant moved to the lobby: (.+)\.$/,
    msg('Participant moved to the lobby: {{name}}.'),
    'name',
  ),
  p(/^Participant readmitted: (.+)\.$/, msg('Participant readmitted: {{name}}.'), 'name'),
  p(
    /^(\S+) FAILED verification: the file or its seal does not match the record\.$/,
    msg('{{code}} FAILED verification: the file or its seal does not match the record.'),
    'code',
  ),
  p(
    /^(\S+) is genuine: the file and its seal match the record\.$/,
    msg('{{code}} is genuine: the file and its seal match the record.'),
    'code',
  ),
  p(
    /^This audit trail has (\S+) rows\. Narrow the filters to at most (\S+) rows and try again\.$/,
    msg(
      'This audit trail has {{total}} rows. Narrow the filters to at most {{max}} rows and try again.',
    ),
    'total',
    'max',
  ),
];

/** Words the API puts inside sentences (categories, decision types) that have their own translation. */
export const SERVER_WORDS = [
  msg('the court'),
  msg('video'),
  msg('audio'),
  msg('scanned document'),
  msg('civil suit'),
  msg('criminal appeal'),
  msg('writ petition'),
  msg('bail application'),
];

/** Translates one captured value: known words, "DD-MM-YYYY at HH:mm", anything else unchanged. */
function translateValue(value: string): string {
  const at = value.match(/^(\d{2}-\d{2}-\d{4}) at (\d{2}:\d{2})$/);
  if (at) return i18n.t('{{date}} at {{time}}', { date: ltr(at[1]), time: at[2] });
  if (i18n.exists(value)) return i18n.t(value);
  // Dates, amounts, CNICs and similar keep their left-to-right order inside Urdu sentences.
  return /^[\d\s.,:+/-]+$/.test(value) || /^PKR /.test(value) ? ltr(value) : value;
}

/** The server's English text in the current language (see the file comment). */
export function translateServerMessage(text: string | null | undefined): string {
  if (!text) return '';
  if (i18n.language === 'en' || !i18n.language) return text;
  if (i18n.exists(text)) return i18n.t(text);
  for (const { re, key, names } of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const params = Object.fromEntries(names.map((n, i) => [n, translateValue(m[i + 1] ?? '')]));
      return i18n.t(key, params);
    }
  }
  return text;
}

/**
 * Any English UI or API text in the current language: shared components run their string props through this, so
 * constants marked with msg() and API messages are translated wherever they are shown. Text that is already
 * translated (or unknown) is returned unchanged.
 */
export const translateText = (text: string | null | undefined): string =>
  translateServerMessage(text);

/** A stored notification: rendered from its template when it has one, otherwise from its English text. */
export function translateNotice(
  text: string,
  key: string | null | undefined,
  params: Record<string, string | number> | null | undefined,
): string {
  if (!key) return translateServerMessage(text);
  const values = Object.fromEntries(
    Object.entries(params ?? {}).map(([k, v]) => [
      k,
      typeof v === 'string' ? translateValue(v) : v,
    ]),
  );
  return i18n.t(key, values);
}
