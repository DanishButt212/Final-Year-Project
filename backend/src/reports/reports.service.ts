import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fullName, RequestMeta } from '../admin/constants';
import { eventId } from '../admin/admin-audit.service';
import { stableStringify, userHash } from '../audit/audit-hash';
import { AuditFilterDto, buildAuditWhere } from '../audit/audit-query';
import { AuditAction, AuditService } from '../audit/audit.service';
import { nextSequence } from '../common/counters';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { buildValidationException } from '../common/validation';
import { Prisma, ReportFormat, ReportKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PerformanceService } from './performance.service';
import {
  AuditExportRow,
  KIND_LABEL,
  ReportData,
  renderExcel,
  renderPdf,
  WaterStamp,
} from './report-render';
import { ReportSealService } from './report-seal.service';
import { ExportReportDto, HistoryQueryDto, PerformanceQueryDto } from './reports.dto';

export const MAX_AUDIT_ROWS = 50_000;
export const PDF_MIME = 'application/pdf';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Pakistan time, DD-MM-YYYY HH:mm:ss (24 hour). */
export function karachiStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Exports, report history and verification. Every file carries the verification waterstamp. */
@Injectable()
export class ReportsService {
  private readonly tmpDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly performance: PerformanceService,
    private readonly seal: ReportSealService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.tmpDir = config.getOrThrow<string>('UPLOAD_TMP_DIR');
  }

  private async parse<T extends object>(
    cls: new () => T,
    raw: Record<string, unknown>,
  ): Promise<T> {
    const inst = plainToInstance(cls, raw ?? {}, { enableImplicitConversion: false });
    const errors = await validate(inst, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) throw buildValidationException(errors);
    return inst;
  }

  // ------------------------------------------------------------------ data

  private async auditRows(f: AuditFilterDto): Promise<AuditExportRow[]> {
    const where = await buildAuditWhere(this.prisma, f);
    const total = await this.prisma.auditLog.count({ where });
    if (total > MAX_AUDIT_ROWS) {
      throw new BadRequestException({
        code: 'TOO_MANY_ROWS',
        message: `This audit trail has ${total.toLocaleString('en-PK')} rows. Narrow the filters to at most ${MAX_AUDIT_ROWS.toLocaleString('en-PK')} rows and try again.`,
      });
    }
    const rows: AuditExportRow[] = [];
    let cursor: string | undefined;
    const emails = new Map<string, string>();
    for (;;) {
      const batch = await this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      const missing = [
        ...new Set(batch.map((b) => b.actorId).filter((x): x is string => !!x && !emails.has(x))),
      ];
      if (missing.length) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: missing } },
          select: { id: true, email: true },
        });
        for (const u of users) emails.set(u.id, u.email);
      }
      for (const r of batch) {
        rows.push({
          eventId: eventId(r.id),
          time: karachiStamp(r.createdAt),
          userHash: userHash(r.actorId),
          actorEmail: r.actorId ? (emails.get(r.actorId) ?? 'removed account') : 'system',
          role: r.actorRole ?? '',
          action: r.action,
          entity: r.entity ?? '',
          entityId: r.entityId ?? '',
          success: r.success ? 'Yes' : 'No',
          eventHash: r.eventHash ?? 'legacy',
        });
      }
      cursor = batch[batch.length - 1].id;
    }
    return rows;
  }

  // ------------------------------------------------------------------ export

  /** "Execute Data Export Compilation": bundles the rows, stamps the file, stores it and streams it back. */
  async export(admin: AuthUser, dto: ExportReportDto, meta: RequestMeta) {
    let data: ReportData;
    let params: Record<string, unknown>;
    let rowCount: number;
    let dataJson: string;
    if (dto.kind === 'PERFORMANCE') {
      const q = await this.parse(PerformanceQueryDto, dto.params);
      const report = await this.performance.compile(q);
      data = { kind: 'PERFORMANCE', report };
      params = { ...report.params };
      rowCount =
        report.byCaseType.length +
        report.byJudge.length +
        report.byCourt.length +
        report.monthly.length;
      dataJson = stableStringify(report);
    } else {
      const f = await this.parse(AuditFilterDto, dto.params);
      const rows = await this.auditRows(f);
      params = {
        q: f.q ?? null,
        action: f.action ?? null,
        entity: f.entity ?? null,
        actor: f.actor ?? null,
        from: f.from ?? null,
        to: f.to ?? null,
        outcome: f.outcome ?? 'all',
      };
      data = { kind: 'AUDIT_TRAIL', rows, filters: params };
      rowCount = rows.length;
      dataJson = stableStringify(rows);
    }
    const dataSha256 = sha256(dataJson);

    const createdAt = new Date();
    const year = createdAt.getUTCFullYear();
    const n = await this.prisma.$transaction((tx) => nextSequence(tx, 'RPT', year));
    const code = `RPT-${year}-${String(n).padStart(6, '0')}`;
    const seal = this.seal.seal({
      code,
      kind: dto.kind,
      format: dto.format,
      params,
      dataSha256,
      createdAt,
    });
    const admins = await this.prisma.user.findUnique({
      where: { id: admin.id },
      select: { firstName: true, lastName: true, email: true },
    });
    const stamp: WaterStamp = {
      code,
      seal,
      generatedAt: karachiStamp(createdAt),
      generatedBy: admins ? `${fullName(admins)} (${admins.email})` : admin.email,
      dataSha256,
      params,
      kindLabel: KIND_LABEL[dto.kind],
    };

    const ext = dto.format === 'PDF' ? 'pdf' : 'xlsx';
    await mkdir(this.tmpDir, { recursive: true });
    const tmp = join(this.tmpDir, `${code}.${ext}`);
    const key = `reports/${code}.${ext}`;
    try {
      if (dto.format === 'PDF') await renderPdf(tmp, data, stamp);
      else await renderExcel(tmp, data, stamp);
      const fileSha256 = await sha256OfFile(tmp);
      const size = (await stat(tmp)).size;
      await this.storage.saveFromPath(tmp, key);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.generatedReport.create({
            data: {
              code,
              kind: dto.kind as ReportKind,
              format: dto.format as ReportFormat,
              params: params as Prisma.InputJsonValue,
              filePath: key,
              fileSha256,
              dataSha256,
              seal,
              rowCount,
              generatedById: admin.id,
              createdAt,
            },
          });
          await this.audit.logWithin(tx, {
            action: AuditAction.REPORT_EXPORTED,
            actorId: admin.id,
            actorRole: admin.role,
            entity: 'GeneratedReport',
            entityId: code,
            metadata: { kind: dto.kind, format: dto.format, rows: rowCount, fileSha256, size },
            ...meta,
          });
        });
      } catch (error) {
        await this.storage.remove(key);
        throw error;
      }
    } finally {
      await rm(tmp, { force: true });
    }
    const fileName = `${code}-${dto.kind === 'PERFORMANCE' ? 'performance' : 'audit-trail'}.${ext}`;
    return {
      code,
      fileName,
      file: new StreamableFile(this.storage.createReadStream(key), {
        type: dto.format === 'PDF' ? PDF_MIME : XLSX_MIME,
        disposition: `attachment; filename="${fileName}"`,
      }),
    };
  }

  // ------------------------------------------------------------------ history

  async history(q: HistoryQueryDto) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.generatedReport.count(),
      this.prisma.generatedReport.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { generatedBy: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        code: r.code,
        kind: r.kind,
        format: r.format,
        params: r.params,
        rowCount: r.rowCount,
        fileSha256: r.fileSha256,
        createdAt: r.createdAt,
        generatedBy: fullName(r.generatedBy),
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  private async load(id: string) {
    const r = await this.prisma.generatedReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(Messages.NOT_FOUND);
    return r;
  }

  async download(admin: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.load(id);
    if (!(await this.storage.exists(r.filePath))) throw new NotFoundException(Messages.NOT_FOUND);
    await this.audit.log({
      action: AuditAction.REPORT_DOWNLOADED,
      actorId: admin.id,
      actorRole: admin.role,
      entity: 'GeneratedReport',
      entityId: r.code,
      ...meta,
    });
    const ext = r.format === 'PDF' ? 'pdf' : 'xlsx';
    const fileName = `${r.code}-${r.kind === 'PERFORMANCE' ? 'performance' : 'audit-trail'}.${ext}`;
    return {
      fileName,
      file: new StreamableFile(this.storage.createReadStream(r.filePath), {
        type: r.format === 'PDF' ? PDF_MIME : XLSX_MIME,
        disposition: `attachment; filename="${fileName}"`,
      }),
    };
  }

  /** Recomputes the SHA-256 of the stored file and the HMAC seal: "valid" or "tampered". */
  async verify(admin: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.load(id);
    let fileMatches = false;
    if (await this.storage.exists(r.filePath)) {
      const hash = createHash('sha256');
      for await (const chunk of this.storage.createReadStream(r.filePath))
        hash.update(chunk as Buffer);
      fileMatches = hash.digest('hex') === r.fileSha256;
    }
    const sealMatches = this.seal.matches(
      {
        code: r.code,
        kind: r.kind,
        format: r.format,
        params: r.params,
        dataSha256: r.dataSha256,
        createdAt: r.createdAt,
      },
      r.seal,
    );
    const status = fileMatches && sealMatches ? 'valid' : 'tampered';
    await this.audit.log({
      action: AuditAction.REPORT_VERIFIED,
      actorId: admin.id,
      actorRole: admin.role,
      entity: 'GeneratedReport',
      entityId: r.code,
      metadata: { status, fileMatches, sealMatches },
      ...meta,
    });
    return {
      code: r.code,
      status,
      fileMatches,
      sealMatches,
      message:
        status === 'valid'
          ? `${r.code} is genuine: the file and its seal match the record.`
          : `${r.code} FAILED verification: the file or its seal does not match the record.`,
      checkedAt: new Date(),
    };
  }
}
