import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { TrimOrUndefined } from '../common/validators';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Filters shared by the audit vault screen and the audit-trail export. */
export class AuditFilterDto extends PageQueryDto {
  /** Free text: event id (EV-...), action, entity, entity id, actor email. */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Event type (the action code). */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entity?: string;

  /** Target account: an actor email (partial) or user id. */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  actor?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Use a valid from date.' })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Use a valid to date.' })
  to?: string;

  @IsOptional()
  @IsIn(['all', 'success', 'failure'])
  outcome?: 'all' | 'success' | 'failure';
}

/** Local (Pakistan, UTC+5) day boundaries so "from/to" match what the admin sees on screen. */
const startOfDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00+05:00`);
const endOfDay = (d: string) => new Date(startOfDay(d).getTime() + 24 * 3600 * 1000);

export function auditRange(from?: string, to?: string) {
  return {
    ...(from ? { gte: startOfDay(from) } : {}),
    ...(to ? { lt: endOfDay(to) } : {}),
  };
}

export async function buildAuditWhere(
  prisma: PrismaService,
  f: AuditFilterDto,
): Promise<Prisma.AuditLogWhereInput> {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.action) and.push({ action: f.action });
  if (f.entity) and.push({ entity: f.entity });
  if (f.outcome === 'success') and.push({ success: true });
  if (f.outcome === 'failure') and.push({ success: false });
  const range = auditRange(f.from, f.to);
  if (range.gte || range.lt) and.push({ createdAt: range });
  if (f.actor) {
    const users = await prisma.user.findMany({
      where: { OR: [{ id: f.actor }, { email: { contains: f.actor, mode: 'insensitive' } }] },
      select: { id: true },
      take: 200,
    });
    and.push({ actorId: { in: users.map((u) => u.id) } });
  }
  if (f.q) {
    const text = f.q.replace(/^EV-/i, '');
    const users = await prisma.user.findMany({
      where: { email: { contains: f.q, mode: 'insensitive' } },
      select: { id: true },
      take: 100,
    });
    and.push({
      OR: [
        { id: { startsWith: text.toLowerCase() } },
        { action: { contains: f.q, mode: 'insensitive' } },
        { entity: { contains: f.q, mode: 'insensitive' } },
        { entityId: { startsWith: text.toLowerCase() } },
        ...(users.length ? [{ actorId: { in: users.map((u) => u.id) } }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}
