import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_CASE_STATUSES, RequestMeta } from './constants';
import { CreateCourtroomDto, UpdateCourtroomDto } from './dto/admin.dto';

const duplicateRoom = () =>
  new ConflictException({
    code: 'DUPLICATE_COURTROOM',
    message: 'A courtroom with this name already exists in that court.',
  });

/** Courts, courtrooms (benches) and the judges attached to them. */
@Injectable()
export class AdminCourtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active case count per judge id. */
  async caseloads(judgeIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.case.groupBy({
      by: ['judgeId'],
      where: {
        judgeId: judgeIds ? { in: judgeIds } : { not: null },
        status: { in: ACTIVE_CASE_STATUSES },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.judgeId as string, r._count._all]));
  }

  async list() {
    const courts = await this.prisma.court.findMany({
      orderBy: { name: 'asc' },
      include: {
        courtrooms: { orderBy: [{ benchNo: 'asc' }, { name: 'asc' }] },
        judges: {
          where: { role: 'JUDGE', status: { not: 'DEACTIVATED' } },
          select: { id: true, firstName: true, lastName: true, status: true, courtroomId: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        },
      },
    });
    const load = await this.caseloads();
    return courts.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      city: c.city,
      isActive: c.isActive,
      courtrooms: c.courtrooms.map((r) => ({
        id: r.id,
        name: r.name,
        benchNo: r.benchNo,
        isActive: r.isActive,
      })),
      judges: c.judges.map((j) => ({
        id: j.id,
        name: `${j.firstName} ${j.lastName}`,
        status: j.status,
        courtroomId: j.courtroomId,
        activeCases: load.get(j.id) ?? 0,
      })),
    }));
  }

  async createCourtroom(actor: AuthUser, dto: CreateCourtroomDto, meta: RequestMeta) {
    const court = await this.prisma.court.findUnique({ where: { id: dto.courtId } });
    if (!court) throw new NotFoundException(Messages.NOT_FOUND);
    try {
      const room = await this.prisma.courtroom.create({
        data: { courtId: dto.courtId, name: dto.name, benchNo: dto.benchNo },
      });
      await this.audit.log({
        action: AuditAction.COURTROOM_CREATED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'Courtroom',
        entityId: room.id,
        metadata: { name: room.name, courtId: room.courtId, benchNo: room.benchNo },
        ...meta,
      });
      return { message: 'Courtroom added.', courtroom: room };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw duplicateRoom();
      }
      throw error;
    }
  }

  async updateCourtroom(actor: AuthUser, id: string, dto: UpdateCourtroomDto, meta: RequestMeta) {
    const existing = await this.prisma.courtroom.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(Messages.NOT_FOUND);
    try {
      const room = await this.prisma.courtroom.update({
        where: { id },
        data: { name: dto.name, benchNo: dto.benchNo, isActive: dto.isActive },
      });
      await this.audit.log({
        action: AuditAction.COURTROOM_UPDATED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'Courtroom',
        entityId: id,
        metadata: {
          before: { name: existing.name, benchNo: existing.benchNo, isActive: existing.isActive },
          after: { name: room.name, benchNo: room.benchNo, isActive: room.isActive },
        },
        ...meta,
      });
      return { message: 'Courtroom updated.', courtroom: room };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw duplicateRoom();
      }
      throw error;
    }
  }
}
