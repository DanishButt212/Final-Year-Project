import { msg } from '@/i18n';
import { GLOSSARY_TERMS } from './glossary-terms';

export interface GlossaryEntry {
  /** Stable id, used in links (/glossary#ucn) and by <Term id="ucn">. */
  id: string;
  term: string;
  definition: string;
}

/**
 * Plain-language explanations of the legal and system terms used in the portals, keyed by the ids in
 * glossary-terms.ts. English is the key; the Urdu text is in src/locales/ur/glossary.json (terminology per
 * docs/URDU_GLOSSARY.md).
 */
const DEFINITIONS: Record<string, string> = {
  'ad-valorem': msg(
    'A court fee calculated as a percentage of the value of the claim, used for civil suits that claim money or property.',
  ),
  adjournment: msg(
    'Postponement of a hearing to a later date, for example when a party or witness is absent. The reason is recorded in the order.',
  ),
  advocate: msg('A lawyer enrolled with a Bar Council who may appear for a party in court.'),
  affidavit: msg(
    'A written statement of facts that the person signing it swears or affirms to be true.',
  ),
  allocation: msg(
    'Assigning a filed case to a judge and courtroom. DigitalAdaalat allocates at random among eligible benches, and every allocation is logged.',
  ),
  appeal: msg('A request to a higher court to review and change the decision of a lower court.'),
  bail: msg(
    'Release of an accused person from custody while the case continues, usually on a surety or bond.',
  ),
  'bail-application': msg('A request to the court to release an accused person on bail.'),
  'bar-council': msg(
    'The body that enrols and regulates advocates. Lawyers are verified against their Bar Council registration before they can file cases.',
  ),
  bench: msg('The judge or judges who hear a case, and by extension the court they sit in.'),
  'cause-list': msg(
    'The published list of cases to be heard by a court on a given day, in order, with the time and courtroom.',
  ),
  chamber: msg(
    "A lawyer's office. In DigitalAdaalat the chamber portal holds clients, billable hours, retainers, expenses and interns.",
  ),
  challan: msg(
    'The payment slip for a court fee, with a challan number, the amount and a due date. Pay it online to move the case forward.',
  ),
  'civil-suit': msg(
    'A case between private parties about rights, property, contracts or money, as opposed to a criminal case.',
  ),
  cnic: msg(
    'Computerised National Identity Card number issued by NADRA, written as 12345-1234567-1.',
  ),
  'court-fee': msg(
    'The fee payable to file a case. It depends on the case type and, for civil suits, on the value of the claim.',
  ),
  courtroom: msg('The room where a bench sits and hearings take place.'),
  'criminal-appeal': msg('An appeal against a conviction or sentence in a criminal case.'),
  decision: msg(
    'The final outcome of a case: a judgment, a dismissal or a disposal. After it the case is closed.',
  ),
  decree: msg(
    'The formal order that follows a judgment in a civil suit and states what each party must do.',
  ),
  dismissal: msg(
    'A decision that rejects the case, for example because it has no merit or the petitioner did not pursue it.',
  ),
  disposal: msg(
    'A case is disposed of when the court finally deals with it, by judgment, dismissal, withdrawal or settlement.',
  ),
  'evidence-vault': msg(
    'Encrypted storage for the pleadings and exhibits of a case. Every file is fingerprinted so any change can be detected.',
  ),
  'ex-parte': msg(
    'A step taken in the absence of the other party, for example when the respondent does not appear after being served.',
  ),
  exhibit: msg(
    'A document or object produced as evidence and marked for identification in the record.',
  ),
  filing: msg(
    'Submitting a case to the court. Once filed, the case receives its case number and its documents are locked.',
  ),
  hearing: msg(
    'A sitting of the court in which a case is taken up, arguments are heard or evidence is recorded.',
  ),
  'interim-order': msg(
    'A temporary order made while the case is still pending, for example to stop an action until the next hearing.',
  ),
  judgment: msg('The reasoned decision of the court on the questions in the case.'),
  jurisdiction: msg(
    'The authority of a court to hear a case, based on place, subject matter and value.',
  ),
  'legal-intern': msg(
    "A law student or graduate training in a lawyer's chamber, who records attendance and research logs for review.",
  ),
  litigant: msg('A person who is a party to a case, whether they brought it or are defending it.'),
  notice: msg(
    'A formal written message from the court informing a person of a case, a date or an order.',
  ),
  order: msg(
    'A direction of the court recorded at a hearing, such as an adjournment, a direction to file documents or an interim order.',
  ),
  petition: msg('A written application to the court asking for a specific order or relief.'),
  petitioner: msg('The party who brings the case to court (in a civil suit, the plaintiff).'),
  plaint: msg(
    'The written statement with which a civil suit begins, setting out the facts and the relief claimed.',
  ),
  pleadings: msg(
    "The parties' formal written statements of their case, such as the plaint, petition and written reply. They are locked once the case is filed.",
  ),
  'process-server': msg(
    'A court official who delivers summons and notices and records proof of service.',
  ),
  'proof-of-service': msg(
    'The record that a summons or notice was delivered: date, time, place, photo and signature, sealed against changes.',
  ),
  relief: msg(
    'What the petitioner asks the court to order, for example payment, an injunction or release on bail.',
  ),
  respondent: msg(
    'The party against whom a case is brought and who must answer it (in a civil suit, the defendant).',
  ),
  scrutiny: msg(
    'The registry check of a newly filed case for completeness, fees and format before it is allocated.',
  ),
  seal: msg(
    'A cryptographic fingerprint added to official PDFs such as receipts, reports and certificates, so anyone can check they were not altered.',
  ),
  summons: msg(
    'A court document requiring a person to appear in court or answer a case on a given date.',
  ),
  ucn: msg(
    'The number given to a case when it is filed, such as DA-2026-CIV-000001. Use it to find the case and its status.',
  ),
  vakalatnama: msg(
    'The document by which a party authorises an advocate to act for them in a case.',
  ),
  'virtual-hearing': msg(
    'A hearing held by video in the virtual courtroom. The join button opens shortly before the hearing time.',
  ),
  'writ-petition': msg(
    'A petition to the High Court to enforce fundamental rights or to correct unlawful action by a public authority.',
  ),
};

export const GLOSSARY: GlossaryEntry[] = Object.entries(DEFINITIONS).map(([id, definition]) => ({
  id,
  term: GLOSSARY_TERMS[id],
  definition,
}));

export const glossaryEntry = (id: string) => GLOSSARY.find((g) => g.id === id);
