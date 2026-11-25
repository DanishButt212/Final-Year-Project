import { api } from './api';

export type DeliveryStatus =
  'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'REPORTED' | 'CLARIFICATION_REQUESTED' | 'REVIEWED';
export const DELIVERY_OUTCOMES = [
  'DELIVERED',
  'UNAVAILABLE',
  'REFUSED',
  'INCORRECT_ADDRESS',
] as const;
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];
export type ReviewAction = 'ACCEPT' | 'REQUEST_CLARIFICATION' | 'RETRY' | 'FORWARD';
type Person = { firstName: string; lastName: string };

export type Attempt = {
  id: string;
  number: number;
  address: string;
  server: Person;
  occurredAt: string;
  reportedAt: string;
  outcome: DeliveryOutcome;
  remarks: string;
  receivedBy: string | null;
  reason: string | null;
  acknowledgmentType: string | null;
  reviews: {
    id: string;
    action: ReviewAction | 'CLARIFICATION_REPLY';
    note: string | null;
    actor: Person;
    createdAt: string;
  }[];
};

export type Delivery = {
  id: string;
  caseId: string;
  ucn: string;
  caseTitle: string;
  documentName: string;
  recipientName: string;
  address: string;
  serverId: string;
  server: Person;
  dueDate: string;
  hearingDate: string | null;
  status: DeliveryStatus;
  version: number;
  attempts: Attempt[];
};

type DeliveryOptions = {
  documents: { id: string; originalName: string }[];
  recipients: { id: string; name: string; address: string | null; role: string }[];
  hearingDate: string | null;
  dueDate: string;
};

export const deliveryKeys = ['document-deliveries'];
const casePath = (mode: 'admin' | 'judge', id: string) => `/${mode}/cases/${id}/deliveries`;
const officerPath = '/server/deliveries';

export const deliveriesApi = {
  async list(mode: 'admin' | 'judge' | 'server', caseId?: string) {
    return (await api.get<Delivery[]>(mode === 'server' ? officerPath : casePath(mode, caseId!)))
      .data;
  },
  async options(caseId: string) {
    return (await api.get<DeliveryOptions>(`/admin/cases/${caseId}/delivery-options`)).data;
  },
  async assign(
    caseId: string,
    values: {
      documentId: string;
      recipientId: string;
      address: string;
      serverId: string;
      dueDate: string;
    },
  ) {
    await api.post(casePath('admin', caseId), values);
  },
  async review(
    delivery: Delivery,
    action: ReviewAction,
    fields: { note?: string; address?: string; serverId?: string; dueDate?: string } = {},
  ) {
    await api.post(`/admin/deliveries/${delivery.id}/review`, {
      version: delivery.version,
      action,
      ...fields,
    });
  },
  async start(delivery: Delivery) {
    await api.post(`${officerPath}/${delivery.id}/start`, { version: delivery.version });
  },
  async report(delivery: Delivery, form: FormData) {
    form.append('version', String(delivery.version));
    await api.post(`${officerPath}/${delivery.id}/report`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  async reply(delivery: Delivery, note: string) {
    await api.post(`${officerPath}/${delivery.id}/clarification`, {
      version: delivery.version,
      note,
    });
  },
  filePath(mode: 'admin' | 'judge' | 'server', id: string, attemptId?: string) {
    const base = mode === 'server' ? officerPath : '/deliveries';
    return attemptId
      ? `${base}/${id}/attempts/${attemptId}/acknowledgment`
      : `${base}/${id}/document`;
  },
};
