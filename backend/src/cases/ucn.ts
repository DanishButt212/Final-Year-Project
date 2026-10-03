import { CaseType, Prisma } from '../generated/prisma/client';

/** Three-letter code used inside the Unique Case Number. Add a code here when a case type is added. */
export const CASE_TYPE_CODE: Record<CaseType, string> = {
  CIVIL_SUIT: 'CIV',
  CRIMINAL_APPEAL: 'CRA',
  WRIT_PETITION: 'WRT',
  BAIL_APPLICATION: 'BAL',
};

export const UCN_REGEX = /^DA-\d{4}-(CIV|CRA|WRT|BAL)-\d{6}$/;

export function formatUcn(year: number, typeCode: string, sequence: number): string {
  return `DA-${year}-${typeCode}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Generates the next Unique Case Number: DA-<YYYY>-<TYPECODE>-<6 digit sequence>.
 *
 * The sequence is per year and per case-type code. It is allocated with a single atomic
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING statement: PostgreSQL locks the counter row until
 * the surrounding transaction ends, so two concurrent submissions can never receive the same number.
 * Call it inside the same transaction that creates the case.
 */
export async function generateUcn(
  tx: Prisma.TransactionClient,
  caseType: CaseType,
  year: number = new Date().getUTCFullYear(),
): Promise<string> {
  const typeCode = CASE_TYPE_CODE[caseType];
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "CaseCounter" ("year", "typeCode", "lastValue", "updatedAt")
    VALUES (${year}, ${typeCode}, 1, NOW())
    ON CONFLICT ("year", "typeCode")
    DO UPDATE SET "lastValue" = "CaseCounter"."lastValue" + 1, "updatedAt" = NOW()
    RETURNING "lastValue"`;
  return formatUcn(year, typeCode, rows[0].lastValue);
}
