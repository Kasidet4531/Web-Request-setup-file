import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MailConfig, emailAddresses } from './mail.config';
import { NotificationStorage } from './notification.storage';
import {
  renderRequestEmail,
  type RequestEmailMetadata,
} from './notification.template';
import type {
  NotificationClient,
  RequestNotificationEvent,
} from './notification.types';
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(
    private readonly storage: NotificationStorage,
    private readonly config: MailConfig,
  ) {}
  async enqueueRequest(
    client: NotificationClient,
    event: RequestNotificationEvent,
  ): Promise<void> {
    const policy = event.targetStatus.emailPolicy;
    if (event.targetStatus.kind === 'draft' || !policy?.enabled) return;
    const savepoint = `notification_${randomUUID().replace(/-/g, '')}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      if (!this.config.baseUrl)
        throw new Error(
          'APP_BASE_URL must be configured before queuing notification emails',
        );
      const result = await client.query<RequestEmailMetadata>(
        `SELECT request_no,requester,product_type,requester_data_json,schema_snapshot_json
        FROM psf_requests WHERE id=$1`,
        [event.requestId],
      );
      if (!result.rows[0])
        throw new Error('Notification request metadata unavailable');
      const requesterAddress = policy.requester
        ? await this.findRequesterAddress(client, event.requestId)
        : undefined;
      const recipients = {
        to: emailAddresses(policy.to.join(',')),
        cc: emailAddresses(policy.cc.join(',')),
      };
      if (requesterAddress && policy.requester)
        recipients[policy.requester] = [
          ...new Set([...recipients[policy.requester], requesterAddress]),
        ];
      const ccOutsideTo = recipients.cc.filter(
        (address) => !recipients.to.includes(address),
      );
      const [to, cc] = recipients.to.length
        ? [recipients.to, ccOutsideTo]
        : [ccOutsideTo, []];
      if (!to.length) {
        this.logger.warn(
          `No email queued for request ${event.requestId}: its Requester has no usable email address and the status has no other recipients`,
        );
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return;
      }
      const rendered = renderRequestEmail(
        event,
        result.rows[0],
        this.config.baseUrl,
      );
      await this.storage.insert(client, {
        event_type: event.eventType,
        request_id: event.requestId,
        to_recipients: to.join(','),
        cc_recipients: cc.join(','),
        bcc_recipients: '',
        subject: rendered.subject,
        body_html: rendered.html,
        target_status_id: event.targetStatus.id,
        target_status_name: event.targetStatus.name,
        from_status_name: event.fromStatus,
        request_no: result.rows[0].request_no,
      });
    } catch (error: unknown) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : '';
      if (code.startsWith('08') || ['57P01', '57P02', '57P03'].includes(code))
        throw error;
      this.logger.error(
        `Notification enqueue failed for request ${event.requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
  private async findRequesterAddress(
    client: NotificationClient,
    requestId: string,
  ): Promise<string | undefined> {
    const result = await client.query<{ email: string | null }>(
      `SELECT account.email FROM psf_requests request
      JOIN app_users account ON account.id=request.requester_user_id
      WHERE request.id=$1`,
      [requestId],
    );
    // Imported Requests have no Requester account, so no address is expected.
    if (!result.rows[0]) return undefined;
    try {
      const parsed = emailAddresses(result.rows[0].email ?? '');
      if (parsed.length === 1) return parsed[0];
    } catch {
      // An invalid account address is reported like a missing one.
    }
    this.logger.warn(
      `The Requester of request ${requestId} has no usable email address`,
    );
    return undefined;
  }
}
