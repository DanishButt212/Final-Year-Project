import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PassThrough, type Readable } from 'node:stream';
import { StreamableFile } from '@nestjs/common';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { EvidenceCryptoService } from '../evidence/evidence-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { isOverdue } from './summons-admin.service';
import { pkDateTime } from '../common/pk-time';

const GREEN = '#01411C';

async function toBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** DD-MM-YYYY HH:mm, Pakistan time. */
const dmyhm = (d: Date) => pkDateTime(d);

/** Read-only view of a case's summons and the Proof of Service PDF. */
@Injectable()
export class SummonsCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: EvidenceCryptoService,
  ) {}

  /** Filers and lawyers: status, attempt dates and outcome notes only. Judge and admin: also server and telemetry. */
  async list(user: AuthUser, caseId: string) {
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, ...(await caseScopeFor(this.prisma, user)) },
      select: { id: true },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    const privileged = user.role === 'JUDGE' || user.role === 'ADMIN';
    const rows = await this.prisma.summons.findMany({
      where: { caseId },
      orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
      include: {
        attempts: { orderBy: { createdAt: 'asc' } },
        server: {
          select: {
            firstName: true,
            lastName: true,
            serverProfile: { select: { badgeNumber: true } },
          },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      noticeType: s.noticeType,
      recipientName: s.recipientName,
      status: s.status,
      dueBy: s.dueBy,
      overdue: isOverdue(s.dueBy, s.status),
      attemptCount: s.attempts.length,
      lastAttemptAt: s.attempts.length ? s.attempts[s.attempts.length - 1].createdAt : null,
      executedAt: s.executedAt,
      serviceMode: s.serviceMode,
      hasProof: s.status === 'EXECUTED',
      attempts: s.attempts.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        notes: a.notes,
        ...(privileged
          ? {
              latitude: a.latitude.toFixed(6),
              longitude: a.longitude.toFixed(6),
              accuracyM: a.accuracyM.toFixed(2),
            }
          : {}),
      })),
      ...(privileged
        ? {
            serviceAddress: s.serviceAddress,
            server: s.server
              ? {
                  name: `${s.server.firstName} ${s.server.lastName}`,
                  badgeNumber: s.server.serverProfile?.badgeNumber ?? null,
                }
              : null,
            proof:
              s.status === 'EXECUTED'
                ? {
                    latitude: s.executedLat?.toFixed(6) ?? null,
                    longitude: s.executedLng?.toFixed(6) ?? null,
                    accuracyM: s.executedAccuracy?.toFixed(2) ?? null,
                    notes: s.executionNotes,
                    hasPhoto: Boolean(s.photoPath),
                    hasSignature: Boolean(s.signaturePath),
                    seal: s.seal,
                  }
                : null,
          }
        : {}),
    }));
  }

  async proofPdf(user: AuthUser, id: string, meta: RequestMeta) {
    const s = await this.prisma.summons.findFirst({
      where: { id, status: 'EXECUTED', case: await caseScopeFor(this.prisma, user) },
      include: {
        case: { select: { ucn: true, title: true } },
        server: {
          select: {
            firstName: true,
            lastName: true,
            serverProfile: { select: { badgeNumber: true } },
          },
        },
      },
    });
    if (!s || !s.executedAt || !s.seal) throw new NotFoundException(Messages.NOT_FOUND);

    const photo =
      s.photoPath && s.photoIv && s.photoTag
        ? await toBuffer(this.crypto.decryptStream(s.photoPath, s.photoIv, s.photoTag)).catch(
            () => null,
          )
        : null;
    const sig =
      s.signaturePath && s.signatureIv && s.signatureTag
        ? await toBuffer(
            this.crypto.decryptStream(s.signaturePath, s.signatureIv, s.signatureTag),
          ).catch(() => null)
        : null;

    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Proof of Service' } });
    const out = new PassThrough();
    doc.pipe(out);
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(20).text('DigitalAdaalat');
    doc
      .fillColor('#4A524C')
      .font('Helvetica')
      .fontSize(10)
      .text('Judicial ERP, Islamic Republic of Pakistan');
    doc.moveDown(0.5);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor(GREEN).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.fillColor('#1A1A1A').font('Helvetica-Bold').fontSize(16).text('Proof of Service');
    doc.moveDown(0.8);
    const rows: [string, string][] = [
      ['Case number', s.case.ucn],
      ['Case title', s.case.title],
      ['Notice type', s.noticeType === 'SUMMONS' ? 'Summons' : 'Notice'],
      ['Recipient', s.recipientName],
      ['Service address', s.serviceAddress],
      [
        'Served by',
        s.server
          ? `${s.server.firstName} ${s.server.lastName} (badge ${s.server.serverProfile?.badgeNumber ?? 'n/a'})`
          : 'n/a',
      ],
      [
        'Service mode',
        s.serviceMode === 'PERSONAL_DELIVERY'
          ? 'Personal delivery'
          : 'Refused service / affixed to gate',
      ],
      ['Date and time', dmyhm(s.executedAt)],
      [
        'Coordinates',
        `${s.executedLat?.toFixed(6)}, ${s.executedLng?.toFixed(6)} (accuracy ${s.executedAccuracy?.toFixed(0)} m)`,
      ],
      ['Field notes', s.executionNotes ?? ''],
    ];
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor('#4A524C').text(k, 56, y, { width: 130 });
      doc.font('Helvetica-Bold').fillColor('#1A1A1A').text(v, 190, y, { width: 349 });
      doc.moveDown(0.4);
    }
    doc.moveDown(0.5);
    if (photo) {
      doc.font('Helvetica-Bold').fontSize(10).text('Photo of the served notice');
      try {
        doc.image(photo, { fit: [300, 200] });
      } catch {
        doc.font('Helvetica').text('(photo could not be embedded)');
      }
      doc.moveDown(0.5);
    }
    if (sig) {
      doc.font('Helvetica-Bold').fontSize(10).text('Recipient signature');
      try {
        doc.image(sig, { fit: [240, 100] });
      } catch {
        doc.font('Helvetica').text('(signature could not be embedded)');
      }
      doc.moveDown(0.5);
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1A1A1A').text('Seal (HMAC-SHA256)');
    doc.font('Courier').fontSize(8).text(s.seal, { width: 483 });
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor(GREEN)
      .text('Digitally sealed by DigitalAdaalat');
    doc.end();

    await this.audit.log({
      action: AuditAction.SUMMONS_PROOF_VIEWED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Summons',
      entityId: id,
      metadata: { kind: 'pdf' },
      ...meta,
    });
    return new StreamableFile(out, {
      type: 'application/pdf',
      disposition: `attachment; filename="proof-of-service-${s.case.ucn}.pdf"`,
    });
  }
}
