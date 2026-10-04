import { createHash } from 'node:crypto';
import { CaseType, Prisma } from '../generated/prisma/client';

type Dec = Prisma.Decimal;
type DecInput = string | number | Prisma.Decimal;
const D = (v: DecInput) => new Prisma.Decimal(v);

export interface FeeInputs {
  caseType: CaseType;
  /** Base filing fee for the case type (FeeStructure). */
  baseFee: DecInput;
  /** Optional claim value; only used for Civil Suits. */
  claimAmountPkr?: DecInput | null;
  adValoremPercent: DecInput;
  adValoremCapPkr: DecInput;
  /** filing_fee_rate_modifier: percentage (0 to 100) added on top of the sum. */
  rateModifierPercent: DecInput;
}

export interface LedgerLine {
  code: 'BASE_FEE' | 'CLAIM_VALUE_FEE' | 'MODIFIER' | 'TOTAL';
  label: string;
  amount: string;
}

const money = (d: Dec) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const fmt = (d: Dec) => money(d).toFixed(2);
const pct = (v: DecInput) => D(v).toDecimalPlaces(2).toString();
const pkr = (v: DecInput) => `PKR ${D(v).toDecimalPlaces(0).toNumber().toLocaleString('en-PK')}`;

/**
 * Statutory cost ledger (UC-4.1). Base filing fee; for a Civil Suit plus ad valorem percent of the claim value
 * (capped); then the policy rate modifier is applied to the sum. All arithmetic is Decimal, never float.
 */
export function calculateLedger(input: FeeInputs): { lines: LedgerLine[]; total: Dec } {
  const base = money(D(input.baseFee));
  const lines: LedgerLine[] = [{ code: 'BASE_FEE', label: 'Base filing fee', amount: fmt(base) }];
  let sum = base;

  if (input.caseType === 'CIVIL_SUIT' && input.claimAmountPkr != null) {
    const claim = D(input.claimAmountPkr);
    const raw = claim.mul(D(input.adValoremPercent)).div(100);
    const cap = D(input.adValoremCapPkr);
    const claimFee = money(raw.greaterThan(cap) ? cap : raw);
    lines.push({
      code: 'CLAIM_VALUE_FEE',
      label: `Claim value fee (${pct(input.adValoremPercent)}% of ${pkr(claim)}, capped at ${pkr(cap)})`,
      amount: fmt(claimFee),
    });
    sum = sum.add(claimFee);
  }

  const modifier = money(sum.mul(D(input.rateModifierPercent)).div(100));
  lines.push({
    code: 'MODIFIER',
    label: `Rate modifier (${pct(input.rateModifierPercent)}%)`,
    amount: fmt(modifier),
  });
  const total = money(sum.add(modifier));
  lines.push({ code: 'TOTAL', label: 'Total payable', amount: fmt(total) });
  return { lines, total };
}

/** Changes whenever any amount input changes, so an unpaid challan knows it must be recalculated. */
export function feeInputHash(input: FeeInputs): string {
  const norm = {
    t: input.caseType,
    b: fmt(D(input.baseFee)),
    c:
      input.caseType === 'CIVIL_SUIT' && input.claimAmountPkr != null
        ? fmt(D(input.claimAmountPkr))
        : null,
    p: pct(input.adValoremPercent),
    k: fmt(D(input.adValoremCapPkr)),
    m: pct(input.rateModifierPercent),
  };
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}
