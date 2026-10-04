import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { caseAudience, caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { buildValidationException } from '../common/validation';
import { CaseEventType, Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { EvidenceCryptoService } from './evidence-crypto.service';
import { LockEvidenceDto, UpdateEvidenceDto, UploadEvidenceDto } from './evidence.dto';
import {
  MIME_BY_EXTENSION,
  MockScreeningService,
  SCREENING_FAILED_MESSAGE,
} from './mock-screening.service';

export const EXHIBIT_ADDED_MESSAGE = 'Digital Exhibit Log Added Successfully.';
export const LOCKED_MESSAGE = 'Action Denied: Document is locked by order of the bench.';
export const NOT_ALLOCATED_MESSAGE =
  'Evidence can be uploaded once the case is allocated to a bench.';

const personName = { select: { firstName: true, lastName: true } } as const;
const nameOf = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** Keeps a readable name but removes directories, control characters and quotes. */
function cleanName(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const forbidden = new Set(['"', '<', '>', ':', '|', '?', '*', '\\', '/']);
  let n = '';
  for (const ch of base) {
    const code = ch.charCodeAt(0);
    n += code < 32 || code === 127 || forbidden.has(ch) ? '_' : ch;
  }
  n = n.replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!n) n = 'exhibit';
  return n.length > 120 ? `${n.slice(0, 100)}${extname(n)}` : n;
}

/** UC-5.1 Upload Digital Exhibits and UC-5.2 Manage Document Vault. */
@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: EvidenceCryptoService,
    private readonly screening: MockScreeningService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ access

  /** The case, if the user may see it (otherwise 404), with what they may do. */
  private async access(user: AuthUser, caseId: string) {
    const c = await this.prisma.case.findFirst({
      where: { AND: [{ id: caseId }, await caseScopeFor(this.prisma, user)] },
      select: {
        id: true,
        ucn: true,
        status: true,
        judgeId: true,
        filedById: true,
        parties: { select: { lawyerId: true } },
      },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    const isFiler = c.filedById === user.id;
    let isCounsel = false;
    if (user.role === 'LAWYER') {
      const profile = await this.prisma.lawyerProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      isCounsel = Boolean(profile && c.parties.some((p) => p.lawyerId === profile.id));
    }
    const party = (isFiler || isCounsel) && (user.role === 'LITIGANT' || user.role === 'LAWYER');
    return { case: c, isFiler, isParty: party, canUpload: party };
  }

  private forbidden() {
    return new ForbiddenException({ code: 'FORBIDDEN', message: Messages.FORBIDDEN });
  }

  private locked() {
    return new ForbiddenException({ code: 'DOCUMENT_LOCKED', message: LOCKED_MESSAGE });
  }

  // ------------------------------------------------------------------ vault

  async vault(user: AuthUser, caseId: string) {
    const a = await this.access(user, caseId);
    const [documents, exhibits] = await Promise.all([
      this.prisma.caseDocument.findMany({
        where: { caseId },
        orderBy: { createdAt: 'asc' },
        include: { uploadedBy: personName },
      }),
      this.prisma.evidence.findMany({
        where: { caseId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { uploadedBy: personName },
      }),
    ]);
    const allocated = a.case.judgeId !== null;
    return {
      caseId,
      canUpload: a.canUpload && allocated,
      uploadBlockedReason: !a.canUpload
        ? 'Only the filer and the lawyers on the case can add exhibits.'
        : allocated
          ? null
          : NOT_ALLOCATED_MESSAGE,
      pleadings: documents.map((d) => ({
        id: d.id,
        kind: 'PLEADING' as const,
        name: d.originalName,
        category: null,
        description: null,
        sizeBytes: d.sizeBytes,
        sha256: d.sha256,
        uploadedBy: nameOf(d.uploadedBy),
        uploadedAt: d.createdAt,
        locked: true,
        lockReason: 'Pleadings are locked to the case number when filed.',
        canEdit: false,
      })),
      exhibits: exhibits.map((e) => ({
        id: e.id,
        kind: 'EXHIBIT' as const,
        name: e.originalName,
        category: e.category,
        description: e.description,
        sizeBytes: e.sizeBytes,
        sha256: e.sha256,
        uploadedBy: nameOf(e.uploadedBy),
        uploadedAt: e.createdAt,
        locked: e.lockedAt !== null,
        lockReason: e.lockReason,
        canEdit: a.isParty && (a.isFiler || e.uploadedById === user.id),
      })),
    };
  }

  // ------------------------------------------------------------------ upload

  private async parseBody(body: Record<string, unknown>): Promise<UploadEvidenceDto> {
    const dto = plainToInstance(UploadEvidenceDto, {
      category: body?.category,
      description: body?.description,
    });
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) throw buildValidationException(errors);
    return dto;
  }

  async upload(
    user: AuthUser,
    caseId: string,
    body: Record<string, unknown>,
    files: Express.Multer.File[],
    meta: RequestMeta,
  ) {
    const a = await this.access(user, caseId);
    if (!a.canUpload) throw this.forbidden();
    if (a.case.status === 'DECIDED') {
      throw new ConflictException({
        code: 'CASE_DECIDED',
        message: 'This case has been decided. No new exhibits can be added.',
      });
    }
    if (a.case.judgeId === null) {
      throw new ConflictException({ code: 'NOT_ALLOCATED', message: NOT_ALLOCATED_MESSAGE });
    }
    const dto = await this.parseBody(body);
    if (!files || files.length === 0) {
      throw new BadRequestException({
        code: 'NO_FILE',
        message: 'Please choose at least one file.',
      });
    }
    const maxMb = await this.settings.maxEvidenceMb();
    for (const f of files) {
      if (f.size === 0 || f.size > maxMb * 1024 * 1024) {
        throw new BadRequestException({
          code: 'EVIDENCE_TOO_LARGE',
          message: `Each file must be under ${maxMb}MB.`,
        });
      }
    }
    // Screening is all or nothing: one bad file discards the whole submission.
    for (const f of files) {
      if (!(await this.screening.passes(f.path, f.originalname, dto.category))) {
        throw new BadRequestException({
          code: 'SECURITY_SCREENING_FAILED',
          message: SCREENING_FAILED_MESSAGE,
        });
      }
    }

    const stored: {
      key: string;
      row: Omit<Prisma.EvidenceUncheckedCreateInput, 'caseId' | 'uploadedById'>;
    }[] = [];
    try {
      for (const f of files) {
        const ext = extname(f.originalname).slice(1).toLowerCase();
        const key = `evidence/${caseId}/${randomUUID()}.enc`;
        const enc = await this.crypto.encryptToStorage(f.path, key);
        const name = cleanName(f.originalname);
        stored.push({
          key,
          row: {
            category: dto.category,
            title: name,
            originalName: name,
            description: dto.description,
            filePath: key,
            mimeType: MIME_BY_EXTENSION[ext] ?? 'application/octet-stream',
            sizeBytes: enc.size,
            sha256: enc.sha256,
            iv: enc.iv,
            authTag: enc.authTag,
          },
        });
      }
      const ids = await this.prisma.$transaction(async (tx) => {
        const created: string[] = [];
        for (const s of stored) {
          const row = await tx.evidence.create({
            data: { ...s.row, caseId, uploadedById: user.id },
            select: { id: true },
          });
          created.push(row.id);
        }
        await tx.caseEvent.create({
          data: {
            caseId,
            type: CaseEventType.EVIDENCE_ADDED,
            description: `${stored.length} digital exhibit${stored.length === 1 ? '' : 's'} added to the vault (${dto.category.replace('_', ' ').toLowerCase()}).`,
            actorId: user.id,
          },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.EVIDENCE_UPLOADED,
          actorId: user.id,
          actorRole: user.role,
          entity: 'Case',
          entityId: caseId,
          metadata: {
            ucn: a.case.ucn,
            category: dto.category,
            files: stored.map((s, i) => ({
              id: created[i],
              sha256: s.row.sha256,
              bytes: s.row.sizeBytes,
            })),
          },
          ...meta,
        });
        if (a.case.judgeId) {
          await this.notifications.notify(
            a.case.judgeId,
            {
              type: 'EVIDENCE_ADDED',
              title: 'New exhibit in the vault',
              body: `${a.case.ucn}: ${stored.length} new exhibit${stored.length === 1 ? '' : 's'} submitted.`,
            },
            tx,
          );
        }
        return created;
      });
      return { message: EXHIBIT_ADDED_MESSAGE, added: ids.length };
    } catch (error) {
      await Promise.all(stored.map((s) => this.storage.remove(s.key).catch(() => undefined)));
      throw error;
    }
  }

  // ------------------------------------------------------------------ edit / delete

  private async editable(user: AuthUser, caseId: string, evidenceId: string) {
    const a = await this.access(user, caseId);
    const e = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, caseId, deletedAt: null },
    });
    if (!e) throw new NotFoundException(Messages.NOT_FOUND);
    if (!a.isParty || !(a.isFiler || e.uploadedById === user.id)) throw this.forbidden();
    if (e.lockedAt) throw this.locked();
    return { a, e };
  }

  async updateDescription(
    user: AuthUser,
    caseId: string,
    evidenceId: string,
    body: Record<string, unknown>,
    meta: RequestMeta,
  ) {
    const dto = plainToInstance(UpdateEvidenceDto, { description: body?.description });
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) throw buildValidationException(errors);
    const { a, e } = await this.editable(user, caseId, evidenceId);
    // Conditional on "still unlocked": a judge's lock order cannot be raced.
    const done = await this.prisma.evidence.updateMany({
      where: { id: e.id, lockedAt: null, deletedAt: null },
      data: { description: dto.description },
    });
    if (done.count !== 1) throw this.locked();
    await this.audit.log({
      action: AuditAction.EVIDENCE_EDITED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Evidence',
      entityId: e.id,
      metadata: { ucn: a.case.ucn },
      ...meta,
    });
    return { message: 'Exhibit description updated.' };
  }

  async remove(user: AuthUser, caseId: string, evidenceId: string, meta: RequestMeta) {
    const { a, e } = await this.editable(user, caseId, evidenceId);
    const done = await this.prisma.evidence.updateMany({
      where: { id: e.id, lockedAt: null, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (done.count !== 1) throw this.locked();
    await this.storage.remove(e.filePath).catch(() => undefined);
    await this.audit.log({
      action: AuditAction.EVIDENCE_DELETED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Evidence',
      entityId: e.id,
      metadata: { ucn: a.case.ucn, sha256: e.sha256 },
      ...meta,
    });
    return { message: 'Exhibit deleted from the vault.' };
  }

  // ------------------------------------------------------------------ download

  async download(user: AuthUser, caseId: string, evidenceId: string, meta: RequestMeta) {
    await this.access(user, caseId);
    const e = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, caseId, deletedAt: null },
    });
    if (!e || !(await this.storage.exists(e.filePath)))
      throw new NotFoundException(Messages.NOT_FOUND);
    await this.audit.log({
      action: AuditAction.EVIDENCE_DOWNLOADED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Evidence',
      entityId: e.id,
      metadata: { caseId, sha256: e.sha256 },
      ...meta,
    });
    const ascii = e.originalName.replace(/[^\x20-\x7e]/g, '_');
    return new StreamableFile(this.crypto.decryptStream(e.filePath, e.iv, e.authTag), {
      type: e.mimeType,
      length: e.sizeBytes,
      disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(e.originalName)}`,
    });
  }

  /** Pleadings for judges and admins (litigants and lawyers already have /cases/:id/documents/:docId/download). */
  async downloadPleading(user: AuthUser, caseId: string, docId: string, meta: RequestMeta) {
    await this.access(user, caseId);
    const d = await this.prisma.caseDocument.findFirst({ where: { id: docId, caseId } });
    if (!d || !(await this.storage.exists(d.filePath)))
      throw new NotFoundException(Messages.NOT_FOUND);
    await this.audit.log({
      action: AuditAction.DOCUMENT_DOWNLOADED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'CaseDocument',
      entityId: d.id,
      metadata: { caseId, sha256: d.sha256 },
      ...meta,
    });
    const ascii = d.originalName.replace(/[^\x20-\x7e]/g, '_');
    return new StreamableFile(this.storage.createReadStream(d.filePath), {
      type: 'application/pdf',
      length: d.sizeBytes,
      disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.originalName)}`,
    });
  }

  // ------------------------------------------------------------------ judge lock

  async lock(judge: AuthUser, caseId: string, dto: LockEvidenceDto, meta: RequestMeta) {
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, judgeId: judge.id },
      select: { id: true, ucn: true },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    const where: Prisma.EvidenceWhereInput = {
      caseId,
      deletedAt: null,
      lockedAt: null,
      ...(dto.evidenceIds && dto.evidenceIds.length > 0 ? { id: { in: dto.evidenceIds } } : {}),
    };
    const now = new Date();
    const locked = await this.prisma.$transaction(async (tx) => {
      const res = await tx.evidence.updateMany({
        where,
        data: { lockedAt: now, lockedById: judge.id, lockReason: dto.reason },
      });
      if (res.count === 0) {
        throw new ConflictException({
          code: 'NOTHING_TO_LOCK',
          message: 'There are no unlocked exhibits to lock.',
        });
      }
      await tx.caseEvent.create({
        data: {
          caseId,
          type: CaseEventType.EVIDENCE_LOCKED,
          description: `${res.count} exhibit${res.count === 1 ? '' : 's'} locked by order of the bench. Reason: ${dto.reason}`,
          actorId: judge.id,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.EVIDENCE_LOCKED,
        actorId: judge.id,
        actorRole: judge.role,
        entity: 'Case',
        entityId: caseId,
        metadata: { ucn: c.ucn, count: res.count, reason: dto.reason },
        ...meta,
      });
      await this.notifications.notifyMany(
        await caseAudience(tx, caseId),
        {
          type: 'EVIDENCE_LOCKED',
          title: 'Exhibits locked by the bench',
          body: `${c.ucn}: ${res.count} exhibit${res.count === 1 ? '' : 's'} locked by order of the bench.`,
        },
        tx,
      );
      return res.count;
    });
    return {
      message: `${locked} exhibit${locked === 1 ? '' : 's'} locked by order of the bench.`,
      locked,
    };
  }
}
