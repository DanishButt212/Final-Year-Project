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
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { invalidFileMessage, Messages } from '../common/messages';
import { buildValidationException } from '../common/validation';
import { CaseEventType, CaseStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { CreateCaseDto, ListCasesQueryDto, PartyDto } from './dto/create-case.dto';
import { removeFiles, sanitizeFileName, sha256OfFile, startsWithPdfMagic } from './pdf-files';
import { generateUcn } from './ucn';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const CLOSED_STATUSES: CaseStatus[] = ['DECIDED', 'REJECTED', 'DISMISSED'];

const personName = { select: { firstName: true, lastName: true } } as const;

const listSelect = {
  id: true,
  ucn: true,
  title: true,
  caseType: true,
  status: true,
  filingDate: true,
  createdAt: true,
  court: { select: { name: true } },
  courtroom: { select: { name: true } },
  judge: personName,
} satisfies Prisma.CaseSelect;

type ListRow = Prisma.CaseGetPayload<{ select: typeof listSelect }>;

function toListItem(c: ListRow) {
  return {
    id: c.id,
    ucn: c.ucn,
    title: c.title,
    caseType: c.caseType,
    status: c.status,
    filingDate: c.filingDate,
    createdAt: c.createdAt,
    court: c.court?.name ?? null,
    courtroom: c.courtroom?.name ?? null,
    judge: c.judge ? `${c.judge.firstName} ${c.judge.lastName}` : null,
  };
}

/** Shared by the portfolio detail and the admin case detail. */
export const caseDetailInclude = {
  court: { select: { id: true, name: true, city: true } },
  courtroom: { select: { id: true, name: true } },
  judge: personName,
  filedBy: personName,
  parties: { orderBy: [{ role: 'asc' }, { position: 'asc' }] },
  documents: { orderBy: { createdAt: 'asc' }, include: { uploadedBy: personName } },
  events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { actor: personName } },
  hearings: {
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
    include: { courtroom: { select: { id: true, name: true } }, judge: personName },
  },
} satisfies Prisma.CaseInclude;

export function toCaseDetail(c: Prisma.CaseGetPayload<{ include: typeof caseDetailInclude }>) {
  const hearings = c.hearings.map((h) => ({
    id: h.id,
    date: h.date.toISOString().slice(0, 10),
    startTime: h.startTime,
    status: h.status,
    purpose: h.purpose,
    courtroom: h.courtroom?.name ?? null,
    judge: `${h.judge.firstName} ${h.judge.lastName}`,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const nextHearing = hearings.find((h) => h.status === 'SCHEDULED' && h.date >= today) ?? null;
  return {
    hearings,
    nextHearing,
    id: c.id,
    ucn: c.ucn,
    title: c.title,
    caseType: c.caseType,
    status: c.status,
    reliefSought: c.reliefSought,
    claimAmountPkr: c.claimAmountPkr ? c.claimAmountPkr.toFixed(2) : null,
    filingDate: c.filingDate,
    createdAt: c.createdAt,
    allocatedAt: c.allocatedAt,
    filedBy: `${c.filedBy.firstName} ${c.filedBy.lastName}`,
    court: c.court,
    courtroom: c.courtroom,
    judgeId: c.judgeId,
    judge: c.judge ? `${c.judge.firstName} ${c.judge.lastName}` : null,
    parties: c.parties.map((p) => ({
      id: p.id,
      role: p.role,
      name: p.name,
      cnic: p.cnic,
      phone: p.phone,
      address: p.address,
      hasCounsel: Boolean(p.lawyerId),
    })),
    documents: c.documents.map((d) => ({
      id: d.id,
      name: d.originalName,
      sizeBytes: d.sizeBytes,
      mimeType: d.mimeType,
      sha256: d.sha256,
      uploadedAt: d.createdAt,
      uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
    })),
    events: c.events.map((e) => ({
      id: e.id,
      type: e.type,
      description: e.description,
      createdAt: e.createdAt,
      actor: e.actor ? `${e.actor.firstName} ${e.actor.lastName}` : null,
    })),
  };
}

interface PreparedFile {
  tempPath: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
  key: string;
}

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ submit

  async create(
    user: AuthUser,
    body: Record<string, unknown>,
    files: Express.Multer.File[],
    meta: RequestMeta,
  ) {
    if (!(await this.settings.caseRegistrationOpen())) {
      throw new ForbiddenException({
        code: 'REGISTRATION_CLOSED',
        message: Messages.CASE_REGISTRATION_CLOSED,
      });
    }
    const dto = await this.parseBody(body);
    const counselId = await this.counselIdFor(user);

    const caseId = randomUUID();
    const prepared = await this.prepareFiles(caseId, files);

    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true, cnic: true, phone: true },
    });
    const petitioners = this.withProfileDefaults(user, dto.petitioners, profile);
    const title = dto.title ?? this.generateTitle(dto);
    const base = Date.now();

    try {
      for (const f of prepared) await this.storage.saveFromPath(f.tempPath, f.key);

      const created = await this.prisma.$transaction(async (tx) => {
        const ucn = await generateUcn(tx, dto.caseType);
        const row = await tx.case.create({
          data: {
            id: caseId,
            ucn,
            caseType: dto.caseType,
            status: 'PENDING_ASSIGNMENT',
            title,
            reliefSought: dto.reliefSought,
            claimAmountPkr: dto.caseType === 'CIVIL_SUIT' && dto.claimAmountPkr ? dto.claimAmountPkr : null,
            filingDate: todayUtc(),
            filedById: user.id,
            parties: {
              create: [
                ...petitioners.map((p, i) => ({
                  role: 'PETITIONER' as const,
                  name: p.name,
                  cnic: p.cnic,
                  phone: p.phone,
                  address: p.address,
                  position: i,
                  lawyerId: counselId,
                })),
                ...dto.respondents.map((p, i) => ({
                  role: 'RESPONDENT' as const,
                  name: p.name,
                  cnic: p.cnic,
                  phone: p.phone,
                  address: p.address,
                  position: i,
                })),
              ],
            },
            documents: {
              create: prepared.map((f, i) => ({
                title: f.originalName,
                originalName: f.originalName,
                filePath: f.key,
                sha256: f.sha256,
                sizeBytes: f.sizeBytes,
                uploadedById: user.id,
                createdAt: new Date(base + i),
              })),
            },
            events: {
              create: [
                {
                  type: CaseEventType.CASE_SUBMITTED,
                  description: `Case submitted as ${ucn} and pending assignment to a judge.`,
                  actorId: user.id,
                  createdAt: new Date(base),
                },
                ...prepared.map((f, i) => ({
                  type: CaseEventType.DOCUMENT_ATTACHED,
                  description: `Document attached: ${f.originalName}`,
                  actorId: user.id,
                  createdAt: new Date(base + 1 + i),
                })),
              ],
            },
          },
          select: {
            id: true,
            ucn: true,
            status: true,
            title: true,
            caseType: true,
            filingDate: true,
          },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.CASE_SUBMITTED,
          actorId: user.id,
          actorRole: user.role,
          entity: 'Case',
          entityId: row.id,
          metadata: { ucn: row.ucn, caseType: row.caseType, documents: prepared.length },
          ...meta,
        });
        return row;
      });

      return {
        message: Messages.CASE_SUBMITTED,
        case: { ...created, documentCount: prepared.length },
      };
    } catch (error) {
      // Nothing may survive a failed submission: remove the files we already moved into storage.
      await this.storage.removePrefix(`cases/${caseId}`).catch(() => undefined);
      throw error;
    }
  }

  // ------------------------------------------------------------------ read

  async list(user: AuthUser, query: ListCasesQueryDto) {
    const where: Prisma.CaseWhereInput = {
      AND: [
        await this.scopeFor(user),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.search
          ? [
              {
                OR: [
                  { ucn: { contains: query.search, mode: 'insensitive' as const } },
                  { title: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.case.count({ where }),
      this.prisma.case.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map(toListItem),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  /** Numbers for the dashboard: total, pending assignment and the five newest cases. */
  async summary(user: AuthUser) {
    const scope = await this.scopeFor(user);
    const [total, pendingAssignment, recent] = await this.prisma.$transaction([
      this.prisma.case.count({ where: scope }),
      this.prisma.case.count({ where: { AND: [scope, { status: 'PENDING_ASSIGNMENT' }] } }),
      this.prisma.case.findMany({
        where: scope,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 5,
      }),
    ]);
    return { total, pendingAssignment, recent: recent.map(toListItem) };
  }

  async detail(user: AuthUser, id: string) {
    const c = await this.prisma.case.findFirst({
      where: { AND: [{ id }, await this.scopeFor(user)] },
      include: caseDetailInclude,
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    return toCaseDetail(c);
  }

  // ------------------------------------------------------------------ documents

  async addDocuments(
    user: AuthUser,
    caseId: string,
    files: Express.Multer.File[],
    meta: RequestMeta,
  ) {
    const target = await this.prisma.case.findFirst({
      where: { AND: [{ id: caseId }, await this.scopeFor(user)] },
      select: { id: true, ucn: true, status: true },
    });
    if (!target) throw new NotFoundException(Messages.NOT_FOUND);
    if (CLOSED_STATUSES.includes(target.status)) {
      throw new ConflictException({ code: 'CASE_CLOSED', message: Messages.CASE_CLOSED });
    }
    await this.counselIdFor(user);
    if (!files || files.length === 0) {
      throw new BadRequestException({ code: 'NO_FILE', message: Messages.MISSING_FILE });
    }

    const prepared = await this.prepareFiles(caseId, files);
    const base = Date.now();
    try {
      for (const f of prepared) await this.storage.saveFromPath(f.tempPath, f.key);
      await this.prisma.$transaction(async (tx) => {
        for (const [i, f] of prepared.entries()) {
          await tx.caseDocument.create({
            data: {
              caseId,
              title: f.originalName,
              originalName: f.originalName,
              filePath: f.key,
              sha256: f.sha256,
              sizeBytes: f.sizeBytes,
              uploadedById: user.id,
              createdAt: new Date(base + i),
            },
          });
          await tx.caseEvent.create({
            data: {
              caseId,
              type: CaseEventType.DOCUMENT_ATTACHED,
              description: `Document attached: ${f.originalName}`,
              actorId: user.id,
              createdAt: new Date(base + i),
            },
          });
        }
        await this.audit.logWithin(tx, {
          action: AuditAction.DOCUMENT_ATTACHED,
          actorId: user.id,
          actorRole: user.role,
          entity: 'Case',
          entityId: caseId,
          metadata: {
            ucn: target.ucn,
            files: prepared.map((f) => ({ name: f.originalName, sha256: f.sha256 })),
          },
          ...meta,
        });
      });
    } catch (error) {
      await Promise.all(prepared.map((f) => this.removeStored(f.key)));
      throw error;
    }
    return { message: Messages.DOCUMENT_ATTACHED, attached: prepared.length };
  }

  async download(user: AuthUser, caseId: string, docId: string, meta: RequestMeta) {
    const doc = await this.prisma.caseDocument.findFirst({
      where: { id: docId, caseId, case: await this.scopeFor(user) },
    });
    if (!doc || !(await this.storage.exists(doc.filePath))) {
      throw new NotFoundException(Messages.NOT_FOUND);
    }
    await this.audit.log({
      action: AuditAction.DOCUMENT_DOWNLOADED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'CaseDocument',
      entityId: doc.id,
      metadata: { caseId, sha256: doc.sha256 },
      ...meta,
    });

    const name = sanitizeFileName(doc.originalName);
    const ascii = name.replace(/[^\x20-\x7e]/g, '_');
    return new StreamableFile(this.storage.createReadStream(doc.filePath), {
      type: 'application/pdf',
      length: doc.sizeBytes,
      disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }

  // ------------------------------------------------------------------ helpers

  /** Cases the user may see: filed by them, or where they are the lawyer on a party. */
  private async scopeFor(user: AuthUser): Promise<Prisma.CaseWhereInput> {
    if (user.role === 'ADMIN') return {};
    if (user.role === 'JUDGE') return { judgeId: user.id };
    const or: Prisma.CaseWhereInput[] = [{ filedById: user.id }];
    if (user.role === 'LAWYER') {
      const profile = await this.prisma.lawyerProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (profile) or.push({ parties: { some: { lawyerId: profile.id } } });
    }
    return { OR: or };
  }

  /** For lawyers: the LawyerProfile id stored as CaseParty.lawyerId on petitioners. */
  private async counselIdFor(user: AuthUser): Promise<string | null> {
    if (user.role !== 'LAWYER') return null;
    const profile = await this.prisma.lawyerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, verificationStatus: true },
    });
    if (!profile) throw new ForbiddenException(Messages.FORBIDDEN);
    if (profile.verificationStatus !== 'VERIFIED') {
      throw new ForbiddenException({
        code: 'LAWYER_NOT_VERIFIED',
        message: Messages.LAWYER_NOT_VERIFIED,
      });
    }
    return profile.id;
  }

  /** Reads the JSON in the multipart `data` field and validates it. */
  private async parseBody(body: Record<string, unknown>): Promise<CreateCaseDto> {
    const raw = body?.data;
    let json: unknown;
    try {
      json = typeof raw === 'string' ? JSON.parse(raw) : undefined;
    } catch {
      json = undefined;
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.CASE_INCOMPLETE,
        details: [
          { field: 'data', messages: ['Send the case details as JSON in the "data" field.'] },
        ],
      });
    }
    const dto = plainToInstance(CreateCaseDto, json);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) throw buildValidationException(errors, Messages.CASE_INCOMPLETE);
    return dto;
  }

  /** Checks the real content of every file (not just names), hashes it, and picks its storage key. */
  private async prepareFiles(
    caseId: string,
    files: Express.Multer.File[] = [],
  ): Promise<PreparedFile[]> {
    const maxMb = await this.settings.maxAttachmentMb();
    const invalid = () =>
      new BadRequestException({ code: 'INVALID_FILE', message: invalidFileMessage(maxMb) });
    for (const f of files) {
      if (f.size === 0 || f.size > maxMb * 1024 * 1024 || !(await startsWithPdfMagic(f.path))) {
        await removeFiles(files.map((x) => x.path));
        throw invalid();
      }
    }
    return Promise.all(
      files.map(async (f) => ({
        tempPath: f.path,
        originalName: sanitizeFileName(f.originalname),
        sizeBytes: f.size,
        sha256: await sha256OfFile(f.path),
        key: `cases/${caseId}/${randomUUID()}.pdf`,
      })),
    );
  }

  private async removeStored(key: string) {
    // Only used for rollback of files we just wrote.
    await this.storage.removePrefix(key).catch(() => undefined);
  }

  /** A litigant's own details fill in a petitioner who is clearly themselves. */
  private withProfileDefaults(
    user: AuthUser,
    petitioners: PartyDto[],
    profile: { firstName: string; lastName: string; cnic: string; phone: string },
  ): PartyDto[] {
    if (user.role !== 'LITIGANT') return petitioners;
    const self = `${profile.firstName} ${profile.lastName}`.toLowerCase();
    return petitioners.map((p, i) =>
      i === 0 && p.name.trim().toLowerCase() === self
        ? { ...p, cnic: p.cnic ?? profile.cnic, phone: p.phone ?? profile.phone }
        : p,
    );
  }

  private generateTitle(dto: CreateCaseDto): string {
    const side = (parties: PartyDto[]) =>
      parties.length > 1 ? `${parties[0].name} & others` : parties[0].name;
    return `${side(dto.petitioners)} vs. ${side(dto.respondents)}`.slice(0, 200);
  }
}

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
