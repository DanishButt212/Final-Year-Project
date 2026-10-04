import { StreamableFile } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'node:stream';
import type { LedgerLine } from './fee-calculator';

const GREEN = '#01411C';

function dmy(d: Date | string): string {
  const iso = (typeof d === 'string' ? new Date(d) : d).toISOString();
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

const pkr = (amount: string) =>
  `PKR ${Number(amount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function start(title: string, subtitle: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title } });
  const out = new PassThrough();
  doc.pipe(out);
  doc
    .fillColor(GREEN)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('DigitalAdaalat', { align: 'left' });
  doc
    .fillColor('#4A524C')
    .font('Helvetica')
    .fontSize(10)
    .text('Judicial ERP, Islamic Republic of Pakistan');
  doc.moveDown(0.5);
  doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor(GREEN).lineWidth(1.5).stroke();
  doc.moveDown(1);
  doc.fillColor('#1A1A1A').font('Helvetica-Bold').fontSize(16).text(title);
  doc.font('Helvetica').fontSize(10).fillColor('#4A524C').text(subtitle);
  doc.moveDown(1);
  return { doc, out };
}

function rows(doc: PDFKit.PDFDocument, items: [string, string][]) {
  for (const [k, v] of items) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor('#4A524C').text(k, 56, y, { width: 150 });
    doc.font('Helvetica-Bold').fillColor('#1A1A1A').text(v, 210, y, { width: 329 });
    doc.moveDown(0.4);
  }
}

function file(out: PassThrough, name: string, length?: number) {
  return new StreamableFile(out, {
    type: 'application/pdf',
    disposition: `attachment; filename="${name}"`,
    ...(length ? { length } : {}),
  });
}

export interface ChallanPdfData {
  challanNo: string;
  ucn: string;
  title: string;
  caseTypeLabel: string;
  status: 'UNPAID' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  issuedAt: Date;
  dueDate: Date;
  lines: LedgerLine[];
}

export function challanPdf(d: ChallanPdfData) {
  const { doc, out } = start('Court Fee Challan', `Challan ${d.challanNo}`);
  rows(doc, [
    ['Challan number', d.challanNo],
    ['Case number', d.ucn],
    ['Case title', d.title],
    ['Case type', d.caseTypeLabel],
    ['Issued on', dmy(d.issuedAt)],
    ['Due date', dmy(d.dueDate)],
    ['Status', d.status === 'PAID' ? 'PAID' : 'UNPAID'],
  ]);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(GREEN).text('Cost ledger');
  doc.moveDown(0.4);
  for (const line of d.lines) {
    const y = doc.y;
    const total = line.code === 'TOTAL';
    if (total) {
      doc
        .moveTo(56, y - 2)
        .lineTo(539, y - 2)
        .strokeColor('#D9DED9')
        .lineWidth(1)
        .stroke();
    }
    doc
      .font(total ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor('#1A1A1A');
    doc.text(line.label, 56, y + 2, { width: 340 });
    doc.text(pkr(line.amount), 400, y + 2, { width: 139, align: 'right' });
    doc.moveDown(0.5);
  }
  doc.moveDown(2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#4A524C')
    .text(
      'This is a computer generated challan. Pay it online through the DigitalAdaalat portal. Payment is accepted until the due date shown.',
      { width: 483 },
    );
  doc.end();
  return file(out, `${d.challanNo}.pdf`);
}

export interface ReceiptPdfData {
  receiptNo: string;
  challanNo: string;
  ucn: string;
  title: string;
  payerName: string;
  amount: string;
  paidAt: Date;
  method: string;
  gatewayRef: string | null;
}

export function receiptPdf(d: ReceiptPdfData) {
  const { doc, out } = start('Fee Receipt', `Receipt ${d.receiptNo}`);
  rows(doc, [
    ['Receipt number', d.receiptNo],
    ['Challan number', d.challanNo],
    ['Case number', d.ucn],
    ['Case title', d.title],
    ['Paid by', d.payerName],
    ['Paid on', dmy(d.paidAt)],
    ['Payment method', d.method],
    ['Gateway reference', d.gatewayRef ?? '-'],
  ]);
  doc.moveDown(1);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(GREEN)
    .text(`Amount received: ${pkr(d.amount)}`);
  doc.moveDown(2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#4A524C')
    .text(
      'Payment received through the simulated demonstration gateway. This receipt is computer generated and valid without a signature.',
      { width: 483 },
    );
  doc.end();
  return file(out, `${d.receiptNo}.pdf`);
}
