import type { OutboxJob, RequestNotificationEvent } from './notification.types';
import type { FormSchemaJson } from '../admin/form_schema.constants';
export function escapeHtml(value: unknown): string {
  return (
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : ''
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// The request tables' short Product Type (frontend productTypeLabel), but other
// values are shown as stored.
const KNOWN_PRODUCT_TYPES =
  /^(New Product|Transfer Product|Existing Product|Create new PSF|Revise from old PSF|Revise Old PSF|Product Transfer)\b/;
function shortProductType(value: unknown): unknown {
  return typeof value === 'string' && KNOWN_PRODUCT_TYPES.test(value)
    ? value.replace(/\s*\(.*\)$/, '')
    : value;
}
const GREEN = '#C6EFCE';
const YELLOW = '#FFEB9C';
export interface RequestEmailMetadata {
  request_no: string;
  requester: string | null;
  product_type: string | null;
  requester_data_json: Record<string, unknown>;
  schema_snapshot_json?: FormSchemaJson;
}
export function renderRequestEmail(
  event: RequestNotificationEvent,
  request: RequestEmailMetadata,
  baseUrl: string,
): { subject: string; html: string } {
  const data = request.requester_data_json ?? {};
  const fieldsByCanonical = new Map(
    (request.schema_snapshot_json?.sections ?? []).flatMap((section) =>
      section.fields.map(
        (field) => [field.canonicalKey, field.fieldKey] as const,
      ),
    ),
  );
  const valueFor = (key: string): unknown =>
    data[fieldsByCanonical.get(key) ?? key];
  const display = (value: unknown) =>
    typeof value === 'string' && value.trim()
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '-';
  const title = display(valueFor('title'));
  const action =
    event.eventType === 'REQUEST_SUBMITTED'
      ? 'New Request'
      : event.targetStatus.kind === 'completed'
        ? 'Completed'
        : event.targetStatus.kind === 'cancelled'
          ? 'Cancelled'
          : `Status Updated to ${event.targetStatus.name}`;
  const subject =
    `[PSF Request] ${action}: ${request.request_no} - ${title}`.replace(
      /[\r\n]/g,
      ' ',
    );
  const fields: [string, unknown, string?][] = [
    ['Request No', request.request_no],
    ['Product Description', title, GREEN],
    ['Requester', request.requester],
    [
      'Product Type',
      shortProductType(valueFor('product_type') ?? request.product_type),
      GREEN,
    ],
    ['Due Date', valueFor('due_date')],
    ['Previous Status', event.fromStatus],
    ['New Status', event.targetStatus.name],
    ['Updated By', event.actor.displayName],
  ];
  const summary = fields
    .map(([key, value, background]) => {
      // Inline styles, since Outlook ignores <style> blocks.
      const fill = background ? `background-color:${background}` : '';
      const labelStyle = ['text-align:left', fill].filter(Boolean).join(';');
      const valueStyle = fill ? ` style="${fill}"` : '';
      return `<tr><th style="${labelStyle}">${escapeHtml(key)}</th><td${valueStyle}>${escapeHtml(display(value))}</td></tr>`;
    })
    .join('');
  const link = `${baseUrl}/requests/${encodeURIComponent(event.requestId)}`;
  const center = 'style="text-align:center"';
  const html = `<h1 ${center}>PSF Setup File Request Management</h1><p ${center}><span style="background-color:${YELLOW}">${escapeHtml(action)}</span></p><table align="center" cellspacing="0" cellpadding="6">${summary}</table>${event.bulkReplacement ? `<p ${center}>Status updated by bulk replacement.</p>` : ''}<p ${center}><a href="${escapeHtml(link)}">View Request</a></p>`;
  return { subject, html };
}

export type FailureAlertJob = Pick<
  OutboxJob,
  | 'id'
  | 'event_type'
  | 'request_id'
  | 'request_no'
  | 'to_recipients'
  | 'cc_recipients'
  | 'attempts'
  | 'last_error'
>;

export function renderFailureAlert(jobs: FailureAlertJob[]): {
  subject: string;
  html: string;
} {
  const rows = jobs
    .map(
      (job) =>
        `<tr><td>${escapeHtml(job.request_no ?? job.request_id ?? '-')}</td><td>${escapeHtml(job.event_type)}</td><td>${escapeHtml(job.to_recipients)} / ${escapeHtml(job.cc_recipients)}</td><td>${job.attempts}</td><td>${escapeHtml(job.last_error ?? 'Delivery claim expired before completion')}</td></tr>`,
    )
    .join('');
  return {
    subject: `[PSF System Alert] Notification Delivery Failures: ${jobs.length} failed`,
    html: `<h1>Notification delivery failures</h1><table><tr><th>Request</th><th>Event</th><th>Intended recipients</th><th>Attempts</th><th>Error</th></tr>${rows}</table>`,
  };
}
