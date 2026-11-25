import { ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

const reservedRange = '[0 1111111111 2222222222 3333333333]';
const reservedContents = Buffer.alloc(16_384, 0xa5);
const pendingField = '/DigitalAdaalatPending';

export async function renderTranscript(data: {
  ucn: string;
  title: string;
  date: Date;
  stenographer: string;
  text: string;
  reserveSignature: boolean;
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, pdfVersion: '1.7' });
  if (process.env.TRANSCRIPT_FONT_PATH) doc.font(process.env.TRANSCRIPT_FONT_PATH);
  else if (/[^\u0000-\u00ff]/.test(data.title + data.stenographer + data.text)) {
    throw new ServiceUnavailableException('Configure a transcript font that supports this text.');
  }
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });

  if (data.reserveSignature) {
    doc.initForm();
    const signature = doc.ref({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      ByteRange: [0, 1111111111, 2222222222, 3333333333],
      Contents: reservedContents,
    });
    signature.end(undefined);
    const widget = {
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: new String('Judge signature'),
      V: null,
      DAReserved: 'DigitalAdaalatPending',
      DASignatureObject: signature.id,
    };
    doc.annotate(0, 0, 0, 0, widget as Parameters<typeof doc.annotate>[4]);
    const internal = doc as PDFKit.PDFDocument & {
      _root: {
        data: {
          AcroForm: { data: { Fields: unknown[]; SigFlags?: number; NeedAppearances?: boolean } };
        };
      };
      page: { annotations: unknown[] };
    };
    const form = internal._root.data.AcroForm.data;
    form.Fields.push(internal.page.annotations.at(-1));
    form.SigFlags = 3;
    delete form.NeedAppearances;
  }

  doc.fontSize(19).text('Hearing transcript').moveDown();
  doc
    .fontSize(11)
    .text(`Case number: ${data.ucn}`)
    .text(`Case title: ${data.title}`)
    .text(`Hearing date: ${data.date.toISOString().slice(0, 10)}`)
    .text(`Stenographer: ${data.stenographer}`)
    .moveDown()
    .text(data.text, { lineGap: 4 });
  doc.end();
  return output;
}

/** Fill the reserved PDF fields without altering the reviewed pages or cross-reference offsets. */
export async function signTranscript(pdf: Buffer, judgeId: string) {
  const root = process.env.TRANSCRIPT_SIGNING_DIR;
  if (!root)
    throw new ServiceUnavailableException('A judge signing certificate must be configured.');
  const directory = join(root, judgeId);
  const cert = join(directory, 'certificate.pem');
  const key = join(directory, 'private-key.pem');
  const chain = join(directory, 'certificate-chain.pem');
  const passphraseFile = join(directory, 'key-passphrase.txt');
  try {
    const certificate = new X509Certificate(await readFile(cert));
    const now = Date.now();
    if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) {
      throw new Error('Certificate outside its validity period.');
    }

    const signed = Buffer.from(pdf);
    const raw = signed.toString('latin1');
    const field = /\/V null\n\/DAReserved \/DigitalAdaalatPending\n\/DASignatureObject (\d+)/.exec(
      raw,
    );
    const rangeIndex = raw.indexOf(reservedRange);
    const marker = reservedContents.toString('hex');
    const contentsIndex = raw.toLowerCase().indexOf(marker);
    if (!field || !raw.includes(pendingField) || rangeIndex < 0 || contentsIndex < 1) {
      throw new Error('Invalid signature placeholder.');
    }
    const signatureStart = contentsIndex - 1;
    const signatureEnd = contentsIndex + marker.length + 1;
    signed.write(`/V ${field[1]} 0 R`.padEnd(field[0].length), field.index, 'ascii');
    const range = `[0 ${signatureStart} ${signatureEnd} ${signed.length - signatureEnd}]`;
    signed.write(range.padEnd(reservedRange.length), rangeIndex, 'ascii');
    const payload = Buffer.concat([
      signed.subarray(0, signatureStart),
      signed.subarray(signatureEnd),
    ]);
    const passin = await access(passphraseFile).then(
      () => `file:${passphraseFile}`,
      () => 'pass:',
    );
    const chainArgs = await access(chain).then(
      () => ['-certfile', chain],
      () => [],
    );
    const cms = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        process.env.TRANSCRIPT_OPENSSL_PATH || 'openssl',
        [
          'cms',
          '-sign',
          '-binary',
          '-outform',
          'DER',
          '-md',
          'sha256',
          '-signer',
          cert,
          '-inkey',
          key,
          '-passin',
          passin,
          ...chainArgs,
        ],
        { windowsHide: true, timeout: 15_000, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stdin.on('error', reject);
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('CMS signing failed.')),
      );
      child.stdin.end(payload);
    });
    if (!cms.length || cms.length > reservedContents.length) throw new Error('Invalid CMS length.');
    signed.write(cms.toString('hex').padEnd(marker.length, '0'), contentsIndex, 'ascii');
    return { pdf: signed, fingerprint: certificate.fingerprint256 };
  } catch {
    throw new ServiceUnavailableException(
      'PDF signing failed. Check the judge certificate and server signing configuration.',
    );
  }
}
