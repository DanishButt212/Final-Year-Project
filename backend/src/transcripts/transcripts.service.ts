import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { activeHearingCoverage } from '../common/case-access';
import { Prisma, TranscriptStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { renderTranscript, signTranscript } from './transcript-pdf';

const person = { select: { firstName: true, lastName: true } } as const;
const hearingInclude = {
  case: { select: { ucn: true, title: true } },
  judge: person,
  stenographer: person,
  transcript: true,
} satisfies Prisma.HearingInclude;
type HearingRow = Prisma.HearingGetPayload<{ include: typeof hearingInclude }>;
const editable: TranscriptStatus[] = ['DRAFT', 'RETURNED'];
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

@Injectable()
export class TranscriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private scope(user: AuthUser): Prisma.HearingWhereInput {
    if (user.role === 'STENOGRAPHER') return { stenographerId: user.id };
    if (user.role === 'JUDGE') {
      return { judgeId: user.id, transcript: { is: { status: { not: 'DRAFT' } } } };
    }
    if (user.role === 'LAWYER') {
      return {
        case: { OR: [
          { parties: { some: { lawyer: { userId: user.id } } } },
          { hearings: { some: { coverageRequests: { some: activeHearingCoverage(user.id) } } } },
        ] },
        transcript: { is: { status: 'SIGNED' } },
      };
    }
    return { id: { in: [] } };
  }

  async list(user: AuthUser, caseId?: string) {
    const rows = await this.prisma.hearing.findMany({
      where: { AND: [this.scope(user), caseId ? { caseId } : {}] },
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      include: hearingInclude,
    });
    return rows.map((h) => ({
      id: h.id,
      caseId: h.caseId,
      ...h.case,
      date: h.date.toISOString().slice(0, 10),
      time: h.startTime,
      judge: h.judge,
      stenographer: h.stenographer,
      status: h.transcript?.status ?? 'DRAFT',
      revision: h.transcript?.revision ?? null,
      text: user.role === 'STENOGRAPHER' ? h.transcript?.text : undefined,
      correctionNote: user.role !== 'LAWYER' ? h.transcript?.correctionNote : undefined,
      signedAt: h.transcript?.signedAt,
    }));
  }

  async assignments(search?: string) {
    const [hearings, stenographers] = await Promise.all([
      this.prisma.hearing.findMany({
        where: {
          status: { not: 'CANCELLED' },
          ...(search ? { case: { ucn: { contains: search, mode: 'insensitive' } } } : {}),
        },
        take: 100,
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          date: true,
          startTime: true,
          stenographerId: true,
          case: { select: { ucn: true, title: true } },
          transcript: { select: { id: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { role: 'STENOGRAPHER', status: 'ACTIVE' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return { hearings, stenographers };
  }

  private async lockHearing(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "Hearing" WHERE id = ${id} FOR UPDATE`;
  }

  async assign(user: AuthUser, id: string, stenographerId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockHearing(tx, id);
      const hearing = await tx.hearing.findFirst({
        where: { id, status: { not: 'CANCELLED' } },
        select: { stenographerId: true, transcript: { select: { id: true } } },
      });
      if (!hearing) throw new NotFoundException();
      if (hearing.stenographerId === stenographerId) return;
      if (hearing.transcript) throw new ConflictException('This hearing already has a transcript.');
      const stenographer = await tx.user.findFirst({
        where: { id: stenographerId, role: 'STENOGRAPHER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!stenographer) throw new NotFoundException();
      await tx.hearing.update({ where: { id }, data: { stenographerId } });
      await this.log(tx, user, id, 'TRANSCRIPT_ASSIGNED', { stenographerId });
    });
    return { message: 'Stenographer assigned.' };
  }

  async save(user: AuthUser, id: string, text: string, revision: number | null) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockHearing(tx, id);
      const hearing = await tx.hearing.findFirst({
        where: { id, stenographerId: user.id },
        select: { transcript: { select: { status: true, revision: true } } },
      });
      if (!hearing) throw new NotFoundException();
      if (!hearing.transcript && revision === null) {
        return tx.hearingTranscript.create({
          data: { hearingId: id, text },
          select: { revision: true },
        });
      }
      if (revision === null) throw this.stale();
      const changed = await tx.hearingTranscript.updateMany({
        where: { hearingId: id, status: { in: editable }, revision },
        data: { text, revision: { increment: 1 } },
      });
      if (!changed.count) throw this.stale();
      return { revision: revision + 1 };
    });
  }

  private async hearing(user: AuthUser, id: string) {
    const row = await this.prisma.hearing.findFirst({
      where: { AND: [{ id }, this.scope(user)] },
      include: hearingInclude,
    });
    if (!row?.transcript) throw new NotFoundException();
    return { ...row, transcript: row.transcript };
  }

  private render(h: HearingRow, text: string, reserveSignature: boolean) {
    const stenographer = h.stenographer;
    if (!stenographer) throw new ConflictException('No stenographer is assigned to this hearing.');
    return renderTranscript({
      ...h.case,
      date: h.date,
      stenographer: `${stenographer.firstName} ${stenographer.lastName}`,
      text,
      reserveSignature,
    });
  }

  async pdf(user: AuthUser, id: string, revision?: number) {
    const h = await this.hearing(user, id);
    const t = h.transcript;
    if (revision !== undefined && t.revision !== revision) throw this.stale();
    let pdf: Buffer;
    if (t.status === 'SIGNED') {
      pdf = await this.readVerified(t.signedPdfKey, t.signedPdfSha256);
    } else if (user.role === 'STENOGRAPHER' && editable.includes(t.status)) {
      pdf = await this.render(h, t.text, false);
    } else {
      pdf = await this.readVerified(t.reviewPdfKey, t.reviewPdfSha256);
    }
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${h.case.ucn}-transcript.pdf"`,
    });
  }

  async submit(user: AuthUser, id: string, revision: number) {
    const h = await this.hearing(user, id);
    if (!editable.includes(h.transcript.status) || h.transcript.revision !== revision)
      throw this.stale();
    if (!h.transcript.text.trim())
      throw new BadRequestException('Enter the dictated statements before submitting.');
    const pdf = await this.render(h, h.transcript.text, true);
    const digest = sha256(pdf);
    await this.withFile(id, pdf, (key) =>
      this.transition(
        user,
        id,
        revision,
        editable,
        {
          status: 'SUBMITTED',
          submittedById: user.id,
          submittedAt: new Date(),
          reviewPdfKey: key,
          reviewPdfSha256: digest,
        },
        'TRANSCRIPT_SUBMITTED',
        { sha256: digest },
      ),
    );
    return { message: 'Transcript submitted for review.' };
  }

  async review(user: AuthUser, id: string, revision: number, correctionNote?: string) {
    const h = await this.hearing(user, id);
    if (h.transcript.status !== 'SUBMITTED' || h.transcript.revision !== revision)
      throw this.stale();
    if (correctionNote === undefined) {
      await this.readVerified(h.transcript.reviewPdfKey, h.transcript.reviewPdfSha256);
    }
    const data: Prisma.HearingTranscriptUncheckedUpdateManyInput =
      correctionNote === undefined
        ? {
            status: 'APPROVED',
            approvedById: user.id,
            approvedAt: new Date(),
            correctionNote: null,
          }
        : { status: 'RETURNED', correctionNote };
    await this.transition(
      user,
      id,
      revision,
      ['SUBMITTED'],
      data,
      correctionNote === undefined ? 'TRANSCRIPT_APPROVED' : 'TRANSCRIPT_RETURNED',
      { sha256: h.transcript.reviewPdfSha256 },
    );
    return {
      message:
        correctionNote === undefined
          ? 'Transcript approved.'
          : 'Transcript returned for correction.',
    };
  }

  async sign(user: AuthUser, id: string, revision: number) {
    const h = await this.hearing(user, id);
    const t = h.transcript;
    if (t.status !== 'APPROVED' || t.revision !== revision || t.approvedById !== user.id)
      throw this.stale();
    const reviewed = await this.readVerified(t.reviewPdfKey, t.reviewPdfSha256);
    const { pdf, fingerprint } = await signTranscript(reviewed, user.id);
    const digest = sha256(pdf);
    await this.withFile(id, pdf, (key) =>
      this.transition(
        user,
        id,
        revision,
        ['APPROVED'],
        {
          status: 'SIGNED',
          signedById: user.id,
          signedAt: new Date(),
          signedPdfKey: key,
          signedPdfSha256: digest,
          signingFingerprint: fingerprint,
        },
        'TRANSCRIPT_SIGNED',
        { sha256: digest, reviewedSha256: t.reviewPdfSha256, fingerprint },
      ),
    );
    return { message: 'Transcript digitally signed and published.' };
  }

  private async readVerified(key: string | null, expected: string | null) {
    if (!key || !expected) throw new NotFoundException();
    const data = await buffer(this.storage.createReadStream(key));
    if (sha256(data) !== expected)
      throw new ConflictException('The stored transcript failed its integrity check.');
    return data;
  }

  private async withFile(id: string, pdf: Buffer, write: (key: string) => Promise<void>) {
    const key = `transcripts/${id}/${randomUUID()}.pdf`;
    try {
      await this.storage.saveFromStream(Readable.from(pdf), key);
      await write(key);
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }

  private async transition(
    user: AuthUser,
    id: string,
    revision: number,
    allowed: TranscriptStatus[],
    data: Prisma.HearingTranscriptUncheckedUpdateManyInput,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.hearingTranscript.updateMany({
        where: { hearingId: id, revision, status: { in: allowed }, hearing: this.scope(user) },
        data: { ...data, revision: { increment: 1 } },
      });
      if (!changed.count) throw this.stale();
      await this.log(tx, user, id, action, { ...metadata, revision: revision + 1 });
    });
  }

  private log(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    id: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return this.audit.logWithin(tx, {
      actorId: user.id,
      actorRole: user.role,
      action,
      entity: 'Hearing',
      entityId: id,
      metadata,
    });
  }

  private stale() {
    return new ConflictException('The transcript has changed. Reload it and try again.');
  }
}
