import { api } from './api';
import { downloadBlob } from './phase4-api';

export type TranscriptStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'SIGNED';
type Person = { firstName: string; lastName: string };
export type TranscriptHearing = {
  id: string;
  caseId: string;
  ucn: string;
  title: string;
  date: string;
  time: string | null;
  judge: Person;
  stenographer: Person | null;
  status: TranscriptStatus;
  revision: number | null;
  text?: string;
  correctionNote?: string | null;
};

export type TranscriptAssignment = {
  id: string;
  date: string;
  startTime: string | null;
  case: { ucn: string; title: string };
  stenographerId: string | null;
  transcript: { id: string } | null;
};

const base = '/hearing-transcripts';
const assignments = '/admin/transcript-assignments';
export const transcriptQuery = ['hearing-transcripts'];

export const transcriptsApi = {
  async list(caseId?: string) {
    return (await api.get<TranscriptHearing[]>(base, { params: { caseId } })).data;
  },
  async save(id: string, text: string, revision: number | null) {
    await api.put(`${base}/${id}/draft`, { text, revision });
  },
  async transition(
    id: string,
    action: 'submit' | 'approve' | 'return' | 'sign',
    revision: number,
    note?: string,
  ) {
    const response = await api.post<{ message: string }>(`${base}/${id}/${action}`, {
      revision,
      note,
    });
    return response.data.message;
  },
  pdfPath(id: string, revision: number) {
    return `${base}/${id}/pdf?revision=${revision}`;
  },
  download(id: string, revision: number, filename: string) {
    return downloadBlob(this.pdfPath(id, revision), filename);
  },
  async assignments(search: string) {
    return (
      await api.get<{
        hearings: TranscriptAssignment[];
        stenographers: (Person & { id: string })[];
      }>(assignments, { params: { search } })
    ).data;
  },
  async assign(hearingId: string, stenographerId: string) {
    await api.patch(`${assignments}/${hearingId}`, { stenographerId });
  },
};
