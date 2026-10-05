import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { MailConfig } from './mail.config';
import { escapeHtml } from './notification.template';
import { buildSoapEnvelope, validateSoapResponse } from './soap-mail';
import type { OutboxJob } from './notification.types';
export const MAIL_FETCH = 'MAIL_FETCH';
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  constructor(
    private readonly config: MailConfig,
    @Optional()
    @Inject(MAIL_FETCH)
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async send(job: OutboxJob): Promise<string> {
    if (!this.config.enabled) throw new Error('Mail delivery is disabled');
    const redirected = this.config.redirectTo.length > 0;
    const to = redirected
      ? this.config.redirectTo.join(',')
      : job.to_recipients;
    const cc = redirected ? '' : job.cc_recipients;
    const bcc = redirected ? '' : job.bcc_recipients;
    const intended = `To: ${job.to_recipients}; CC: ${job.cc_recipients}; BCC: ${job.bcc_recipients}`;
    const subject = redirected ? `[TEST] ${job.subject}` : job.subject;
    const html = redirected
      ? `<div role="note"><strong>TEST DELIVERY</strong><p>Intended recipients: ${escapeHtml(intended)}</p></div>${job.body_html}`
      : job.body_html;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    try {
      const response = await this.fetcher(this.config.soapUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://tempuri.org/SendMail"',
        },
        body: buildSoapEnvelope(this.config, { to, cc, bcc, subject, html }),
        signal: controller.signal,
        redirect: 'error',
      });
      const xml = await response.text();
      try {
        validateSoapResponse(xml, response.status);
      } catch (error) {
        this.logger.error('SOAP mail rejected response', xml);
        throw error;
      }
      return `To: ${to}; CC: ${cc}; BCC: ${bcc}`;
    } catch (error) {
      if (timedOut) throw new Error('SOAP mail timeout');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
