import type { PoolClient } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
export type StatusEmailPolicy = {
  enabled: boolean;
  to: string[];
  cc: string[];
};
export type RequestNotificationEvent = {
  eventType: 'REQUEST_SUBMITTED' | 'REQUEST_STATUS_CHANGED';
  requestId: string;
  fromStatus: string;
  targetStatus: {
    id: string;
    name: string;
    kind: 'draft' | 'open' | 'completed' | 'cancelled';
    emailPolicy?: StatusEmailPolicy;
  };
  actor: AuthenticatedUserProfile;
  bulkReplacement?: boolean;
};
export type NotificationClient = Pick<PoolClient, 'query'>;
export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed';
export interface OutboxJob {
  id: string;
  event_type:
    | RequestNotificationEvent['eventType']
    | 'ADMIN_ALERT'
    | 'ADMIN_TEST';
  request_id: string | null;
  from_address: string;
  to_recipients: string;
  cc_recipients: string;
  bcc_recipients: string;
  subject: string;
  body_html: string;
  status: OutboxStatus;
  attempts: number;
  claim_token: string | null;
  last_error?: string | null;
  request_no?: string | null;
}
export type OutboxSnapshot = Pick<
  OutboxJob,
  | 'event_type'
  | 'request_id'
  | 'to_recipients'
  | 'cc_recipients'
  | 'bcc_recipients'
  | 'subject'
  | 'body_html'
> & {
  target_status_id?: string | null;
  target_status_name?: string | null;
  from_status_name?: string | null;
  request_no?: string | null;
};
