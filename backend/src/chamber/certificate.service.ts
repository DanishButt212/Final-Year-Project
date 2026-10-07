import { ConflictException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { nextSequence } from '../common/counters';
import { Messages } from '../common/messages';
import { pkDateTime, pkDdMmYyyy, pkParts } from '../common/pk-time';
import { InternCertificate } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChamberContext } from './chamber.guard';
import { isoDay } from './chamber.util';
import type { InternContext } from './intern.service';

const GREEN = '#01411C';
const GOLD = '#B8962E';
const INK = '#1A1A1A';
const MUTED = '#4A524C';

export const NOT_ELIGIBLE =
  'A certificate can be issued once the intern has at least one approved research log.';
export const NOT_ISSUED_YET = 'Your supervising lawyer has not issued your completion certificate yet.';

const ddmmyyyyDate = (d: Date) => {
  const s = isoDay(d);
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
};

/**
 * Intern completion certificate: issued once by the supervising lawyer, frozen at issue time, sealed with
 * HMAC-SHA256 (keyed with REPORT_SEAL_SECRET, domain-separated from report seals) and rendered as a PDF on demand.
 */
@Injectable()
export class CertificateService {
  private readonly secret: Buffer;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    const raw = config.get<string>('REPORT_SEAL_SECRET');
    const key = raw && raw !== 'CHANGE_ME' ? Buffer.from(raw, 'base64') : null;
    if (!key || key.length !== 32) {
      throw new Error(
        'REPORT_SEAL_SECRET is missing or invalid. Set it to 32 random bytes encoded as base64 (see backend/.env.example).',
      );
    }
    this.secret = key;
  }

  // ------------------------------------------------------------------ seal

  private canonical(c: Omit<InternCertificate, 'id' | 'seal'>): string {
    return [
      'intern-certificate:v1',
      JSON.stringify({
        certificateNo: c.certificateNo,
        internId: c.internId,
        lawyerProfileId: c.lawyerProfileId,
        internName: c.internName,
        lawyerName: c.lawyerName,
        chamberName: c.chamberName,
        chamberCode: c.chamberCode,
        periodFrom: isoDay(c.periodFrom),
        periodTo: isoDay(c.periodTo),
        approvedLogs: c.approvedLogs,
        attendanceDays: c.attendanceDays,
        issuedAt: c.issuedAt.toISOString(),
      }),
    ].join('\n');
  }

  private sealOf(c: Omit<InternCertificate, 'id' | 'seal'>): string {
    return createHmac('sha256', this.secret).update(this.canonical(c)).digest('hex');
  }

  private matches(c: InternCertificate): boolean {
    const a = Buffer.from(this.sealOf(c), 'hex');
    const b = Buffer.from(c.seal, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private view(c: InternCertificate) {
    return {
      id: c.id,
      certificateNo: c.certificateNo,
      internName: c.internName,
      lawyerName: c.lawyerName,
      chamberName: c.chamberName,
      chamberCode: c.chamberCode,
      periodFrom: isoDay(c.periodFrom),
      periodTo: isoDay(c.periodTo),
      approvedLogs: c.approvedLogs,
      attendanceDays: c.attendanceDays,
      issuedAt: c.issuedAt,
      seal: c.seal,
    };
  }

  // ------------------------------------------------------------------ lawyer

  private async internOf(ctx: ChamberContext, internId: string) {
    const intern = await this.prisma.internProfile.findFirst({
      where: { id: internId, supervisorId: ctx.lawyerId },
      select: {
        id: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
        certificate: true,
      },
    });
    if (!intern) throw new NotFoundException(Messages.NOT_FOUND);
    return intern;
  }

  private async approvedRange(internId: string) {
    const agg = await this.prisma.internDiaryEntry.aggregate({
      where: { internId, reviewStatus: 'APPROVED' },
      _count: { _all: true },
      _min: { entryDate: true },
      _max: { entryDate: true },
    });
    return { count: agg._count._all, from: agg._min.entryDate, to: agg._max.entryDate };
  }

  /** Eligibility and the certificate (if issued) for the lawyer's intern page. */
  async forLawyer(ctx: ChamberContext, internId: string) {
    const intern = await this.internOf(ctx, internId);
    if (intern.certificate && intern.certificate.lawyerProfileId !== ctx.lawyerId) {
      throw new NotFoundException(Messages.NOT_FOUND);
    }
    const range = await this.approvedRange(intern.id);
    return {
      eligible: !intern.certificate && range.count > 0,
      approvedLogs: range.count,
      message: intern.certificate ? null : range.count > 0 ? null : NOT_ELIGIBLE,
      certificate: intern.certificate ? this.view(intern.certificate) : null,
    };
  }

  async issue(ctx: ChamberContext, internId: string, meta: RequestMeta) {
    const intern = await this.internOf(ctx, internId);
    if (intern.certificate) {
      throw new ConflictException({
        code: 'CERTIFICATE_EXISTS',
        message: 'A certificate has already been issued for this intern.',
      });
    }
    const range = await this.approvedRange(intern.id);
    if (range.count === 0 || !range.from || !range.to) {
      throw new ConflictException({ code: 'NOT_ELIGIBLE', message: NOT_ELIGIBLE });
    }
    const [attendanceDays, lawyer] = await Promise.all([
      this.prisma.attendance.count({ where: { internId: intern.id } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);
    const issuedAt = new Date();
    const year = pkParts(issuedAt).year;
    try {
      const cert = await this.prisma.$transaction(async (tx) => {
        const seq = await nextSequence(tx, 'CERT', year);
        const data = {
          certificateNo: `CERT-${year}-${String(seq).padStart(6, '0')}`,
          internId: intern.id,
          lawyerProfileId: ctx.lawyerId,
          issuedById: ctx.userId,
          internName: `${intern.user.firstName} ${intern.user.lastName}`,
          lawyerName: `${lawyer.firstName} ${lawyer.lastName}`,
          chamberName: ctx.chamber.name,
          chamberCode: ctx.chamber.chamberCode,
          periodFrom: range.from as Date,
          periodTo: range.to as Date,
          approvedLogs: range.count,
          attendanceDays,
          issuedAt,
        };
        const created = await tx.internCertificate.create({
          data: { ...data, seal: this.sealOf(data) },
        });
        await tx.internProfile.update({
          where: { id: intern.id },
          data: { certificateIssuedAt: issuedAt },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.INTERN_CERTIFICATE_ISSUED,
          actorId: ctx.userId,
          actorRole: 'LAWYER',
          entity: 'InternCertificate',
          entityId: created.id,
          metadata: {
            certificateNo: created.certificateNo,
            internId: intern.id,
            chamber: ctx.chamber.chamberCode,
          },
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        });
        await this.notifications.notifyMany(
          [intern.userId],
          {
            type: 'CERTIFICATE_ISSUED',
            title: 'Completion certificate issued',
            body: `${ctx.chamber.name} issued your completion certificate ${created.certificateNo}. You can download it from the Certificate page.`,
          },
          tx,
        );
        return created;
      });
      return {
        message: `Completion certificate ${cert.certificateNo} issued.`,
        certificate: this.view(cert),
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'CERTIFICATE_EXISTS',
          message: 'A certificate has already been issued for this intern.',
        });
      }
      throw error;
    }
  }

  async lawyerCertificate(ctx: ChamberContext, internId: string): Promise<InternCertificate> {
    const cert = await this.prisma.internCertificate.findFirst({
      where: { internId, lawyerProfileId: ctx.lawyerId },
    });
    if (!cert) throw new NotFoundException(Messages.NOT_FOUND);
    return cert;
  }

  // ------------------------------------------------------------------ intern

  async forIntern(ctx: InternContext) {
    const cert = await this.prisma.internCertificate.findUnique({
      where: { internId: ctx.internId },
    });
    return cert
      ? { certificate: this.view(cert), message: null }
      : { certificate: null, message: NOT_ISSUED_YET };
  }

  async internCertificate(ctx: InternContext): Promise<InternCertificate> {
    const cert = await this.prisma.internCertificate.findUnique({
      where: { internId: ctx.internId },
    });
    if (!cert) throw new NotFoundException(Messages.NOT_FOUND);
    return cert;
  }

  // ------------------------------------------------------------------ verify and PDF

  verify(cert: InternCertificate) {
    const valid = this.matches(cert);
    return {
      valid,
      certificateNo: cert.certificateNo,
      message: valid
        ? 'Certificate seal verified. The certificate is authentic and unchanged.'
        : 'Certificate seal does not match. The certificate record has been altered.',
    };
  }

  /** The PDF as a download. */
  async download(cert: InternCertificate): Promise<StreamableFile> {
    const buf = await this.pdf(cert);
    return new StreamableFile(buf, {
      type: 'application/pdf',
      length: buf.length,
      disposition: `attachment; filename="${cert.certificateNo}.pdf"`,
    });
  }

  async pdf(cert: InternCertificate): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 50, left: 60, right: 60, bottom: 50 },
      info: {
        Title: `Completion Certificate ${cert.certificateNo}`,
        Author: 'DigitalAdaalat',
        Subject: `Verified ${cert.certificateNo}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const { width: w, height: h } = doc.page;

    // Frame and watermark, same look as the sealed reports.
    doc.rect(24, 24, w - 48, h - 48).lineWidth(2).strokeColor(GREEN).stroke();
    doc.rect(32, 32, w - 64, h - 64).lineWidth(0.6).strokeColor(GOLD).stroke();
    doc.save();
    doc.rotate(-25, { origin: [w / 2, h / 2] });
    doc.fillColor(GREEN).fillOpacity(0.06).font('Helvetica-Bold').fontSize(34);
    doc.text(`DigitalAdaalat - Verified ${cert.certificateNo}`, w / 2 - 360, h / 2 - 18, {
      width: 720,
      align: 'center',
      lineBreak: false,
    });
    doc.restore();
    doc.fillOpacity(1);

    const inner = { width: w - 120, align: 'center' as const };
    doc.y = 70;
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(20).text('DigitalAdaalat', 60, doc.y, inner);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Judicial ERP, Islamic Republic of Pakistan', inner);
    doc.moveDown(1.2);
    doc.fillColor(INK).font('Times-Bold').fontSize(28).text('Certificate of Completion', inner);
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Legal Internship', inner);
    doc.moveDown(1.2);
    doc.fillColor(INK).font('Helvetica').fontSize(12).text('This is to certify that', inner);
    doc.moveDown(0.4);
    doc.fillColor(GREEN).font('Times-Bold').fontSize(24).text(cert.internName, inner);
    doc.moveDown(0.5);
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(12)
      .text(
        `completed a legal internship under the supervision of ${cert.lawyerName}, ${cert.chamberName} (${cert.chamberCode}), from ${ddmmyyyyDate(cert.periodFrom)} to ${ddmmyyyyDate(cert.periodTo)}.`,
        inner,
      );
    doc.moveDown(1);
    doc
      .fontSize(11)
      .text(
        `Approved research logs: ${cert.approvedLogs}     Attendance days: ${cert.attendanceDays}     Issued on: ${pkDdMmYyyy(cert.issuedAt)}`,
        inner,
      );
    doc.moveDown(2.2);

    // Signature line for the supervising lawyer.
    const lineY = doc.y + 20;
    doc.moveTo(w / 2 - 120, lineY).lineTo(w / 2 + 120, lineY).lineWidth(0.8).strokeColor(INK).stroke();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(cert.lawyerName, 60, lineY + 6, inner);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(`Supervising advocate, ${cert.chamberName}`, inner);

    // Footer with the certificate number and the start of the seal.
    doc.fillColor(MUTED).font('Helvetica').fontSize(8);
    doc.text(
      `Certificate ${cert.certificateNo}  |  Seal ${cert.seal.slice(0, 16)}  |  Issued ${pkDateTime(cert.issuedAt)} (PKT)  |  Verify on DigitalAdaalat`,
      60,
      h - 62,
      { width: w - 120, align: 'center', lineBreak: false },
    );
    doc.end();
    return done;
  }
}
