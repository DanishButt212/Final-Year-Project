import { Prisma } from '../generated/prisma/client';

/**
 * Atomic per-year counter (same technique as the UCN generator): one INSERT ... ON CONFLICT ... RETURNING,
 * so two concurrent callers inside transactions can never receive the same number.
 */
export async function nextSequence(
  tx: Prisma.TransactionClient,
  typeCode: string,
  year: number = new Date().getUTCFullYear(),
): Promise<number> {
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "CaseCounter" ("year", "typeCode", "lastValue", "updatedAt")
    VALUES (${year}, ${typeCode}, 1, NOW())
    ON CONFLICT ("year", "typeCode")
    DO UPDATE SET "lastValue" = "CaseCounter"."lastValue" + 1, "updatedAt" = NOW()
    RETURNING "lastValue"`;
  return rows[0].lastValue;
}

const pad = (n: number) => String(n).padStart(6, '0');

/** CH-<YYYY>-<6 digits> */
export async function nextChallanNo(
  tx: Prisma.TransactionClient,
  year = new Date().getUTCFullYear(),
) {
  return `CH-${year}-${pad(await nextSequence(tx, 'CH', year))}`;
}

/** RCPT-<YYYY>-<6 digits> */
export async function nextReceiptNo(
  tx: Prisma.TransactionClient,
  year = new Date().getUTCFullYear(),
) {
  return `RCPT-${year}-${pad(await nextSequence(tx, 'RCPT', year))}`;
}
