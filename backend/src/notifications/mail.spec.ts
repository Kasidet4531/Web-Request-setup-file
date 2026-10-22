import { MailConfig } from './mail.config';
import { buildSoapEnvelope, validateSoapResponse } from './soap-mail';
import { renderRequestEmail } from './notification.template';
import type { RequestNotificationEvent } from './notification.types';
const enabled = {
  MAIL_ENABLED: 'true',
  NODE_ENV: 'test',
  MAIL_SOAP_URL: 'http://127.0.0.1/mail',
  MAIL_SMTP_SERVER: 'smtp.local',
  MAIL_DEFAULT_TO: 'fallback@example.com',
  MAIL_ADMIN_TO: 'admin@example.com',
  APP_BASE_URL: 'http://localhost:3000',
  MAIL_REDIRECT_TO: 'test@example.com',
};
const success =
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><m:SendMailResponse xmlns:m="http://tempuri.org/" /></s:Body></s:Envelope>';
const statusChange = (
  overrides: Partial<RequestNotificationEvent> = {},
): RequestNotificationEvent => ({
  eventType: 'REQUEST_STATUS_CHANGED',
  requestId: '123',
  fromStatus: '10% -- Test Engineer Data Entry',
  targetStatus: {
    id: 's',
    name: '30% -- Compare Old and New layout',
    kind: 'open',
  },
  actor: {
    id: 'u',
    username: 'somchai.j',
    displayName: 'Somchai Jaidee',
    role: 'setup_owner',
    setupOwnerDepartment: 'GNTC',
  },
  ...overrides,
});

// Shaped like a request on the Initial Data Load requester form.
const importedFormRequest = (extra: Record<string, unknown> = {}) => {
  const field = (key: string, label: string) => ({
    fieldKey: key,
    canonicalKey: key,
    label,
    type: 'text' as const,
    required: false,
  });
  const productType = 'Create new PSF (Require PCSF , E142 or .DPL)';
  const base = {
    product_type: productType,
    title: 'Chip A',
    requester_name: 'Somebody Requester',
    due_date: '2026-08-07',
    start_date: '2026-08-04',
  };
  return {
    request_no: 'PSF-000123',
    requester: 'Somebody Requester',
    product_type: productType,
    requester_data_json: { ...base, ...extra },
    schema_snapshot_json: {
      formKey: 'psf-request',
      version: 2,
      title: 'Requester Information',
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          fields: [
            field('product_type', 'Request To'),
            field('title', 'Product_Description'),
            field('due_date', 'Due Date'),
            field('start_date', 'Start Date'),
            ...Object.keys(extra)
              .filter((key) => !(key in base))
              .map((key) => field(key, key)),
          ],
        },
      ],
    },
  };
};

const rowPattern = /<tr><th>(.*?)<\/th><td>(.*?)<\/td><\/tr>/g;
const rows = (html: string) =>
  [...html.matchAll(rowPattern)].map(([, label, value]) => [label, value]);
const rowLabels = (html: string) => rows(html).map(([label]) => label);
describe('mail safety and SOAP', () => {
  it('disables delivery by default and fixes From', () => {
    expect(new MailConfig({}).enabled).toBe(false);
    expect(new MailConfig({}).pollIntervalMs).toBe(15000);
    expect(new MailConfig({}).systemName).toBe('PSF Setup File');
    expect(
      new MailConfig({ MAIL_DEFAULT_TO: 'admin@example.com' }).adminTo,
    ).toEqual(['admin@example.com']);
    expect(new MailConfig({ MAIL_FROM: 'evil@example.com' }).from).toBe(
      'noreply-psf@nxp.com',
    );
  });
  it('requires redirect outside production and validates settings', () => {
    expect(() => new MailConfig({ ...enabled, MAIL_REDIRECT_TO: '' })).toThrow(
      /redirect/i,
    );
    expect(
      () => new MailConfig({ ...enabled, MAIL_POLL_INTERVAL_MS: '0' }),
    ).toThrow();
    expect(
      () => new MailConfig({ ...enabled, MAIL_TIMEOUT_MS: '300001' }),
    ).toThrow();
    expect(
      () => new MailConfig({ ...enabled, MAIL_SMTP_PORT: '-1' }),
    ).toThrow();
    expect(
      () => new MailConfig({ ...enabled, NODE_ENV: 'production' }),
    ).toThrow(/loopback/i);
  });
  it.each([
    'http://[::ffff:127.0.0.2]',
    'http://[::ffff:127.255.255.255]',
    'http://[0:0:0:0:0:ffff:7f00:2]',
    'http://[::ffff:0.0.0.0]',
    'http://localhost.',
    'http://sub.localhost.',
    'http://LOCALHOST.',
  ])('rejects normalized local addresses in production: %s', (baseUrl) => {
    expect(
      () =>
        new MailConfig({
          ...enabled,
          NODE_ENV: 'production',
          APP_BASE_URL: baseUrl,
          MAIL_REDIRECT_TO: '',
        }),
    ).toThrow(/loopback/i);
  });
  it('allows mapped IPv4 addresses outside the local ranges in production', () => {
    expect(
      () =>
        new MailConfig({
          ...enabled,
          NODE_ENV: 'production',
          APP_BASE_URL: 'http://[::ffff:10.20.30.40]',
          MAIL_REDIRECT_TO: '',
        }),
    ).not.toThrow();
  });
  it('accepts only SOAP 1.1 body responses in the service namespace', () => {
    expect(() => validateSoapResponse(success, 200)).not.toThrow();
    expect(() =>
      validateSoapResponse(
        success.replace('http://tempuri.org/', 'urn:wrong'),
        200,
      ),
    ).toThrow();
    expect(() =>
      validateSoapResponse(
        success
          .replace('<s:Body>', '<s:Header>')
          .replace('</s:Body>', '</s:Header>'),
        200,
      ),
    ).toThrow();
  });
  it('rejects faults including HTTP 200 and decodes/caps their first line', () => {
    const fault = success.replace(
      '<m:SendMailResponse xmlns:m="http://tempuri.org/" />',
      '<s:Fault><faultstring>Bad &lt;address&gt;\nsecret stack</faultstring></s:Fault>',
    );
    expect(() => validateSoapResponse(fault, 200)).toThrow('Bad <address>');
    try {
      validateSoapResponse(fault, 200);
    } catch (error) {
      expect((error as Error).message).not.toContain('secret');
    }
    expect(() => validateSoapResponse(success, 503)).toThrow(/HTTP 503/);
  });
  it('rejects invalid XML and DTDs', () => {
    expect(() => validateSoapResponse('<broken>', 200)).toThrow();
    expect(() =>
      validateSoapResponse(
        '<!DOCTYPE s [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + success,
        200,
      ),
    ).toThrow();
  });
  it('rejects SOAP faults nested under a response in the body', () => {
    const nested = success.replace(
      '<m:SendMailResponse xmlns:m="http://tempuri.org/" />',
      '<m:SendMailResponse xmlns:m="http://tempuri.org/"><s:Fault><faultstring>nested failure</faultstring></s:Fault></m:SendMailResponse>',
    );
    expect(() => validateSoapResponse(nested, 200)).toThrow('nested failure');
  });
  it('escapes XML fields and splits CDATA terminators', () => {
    const xml = buildSoapEnvelope(new MailConfig(enabled), {
      to: 'a&b@example.com',
      cc: '',
      bcc: '',
      subject: '<evil>"\'',
      html: '<b>]]></b>',
    });
    expect(xml).toContain('a&amp;b');
    expect(xml).toContain('&lt;evil&gt;&quot;&apos;');
    expect(xml).toContain(']]]]><![CDATA[>');
    expect(xml).toContain('noreply-psf@nxp.com');
  });
  it('escapes request snapshots and excludes PSF Created information', () => {
    const event: RequestNotificationEvent = {
      eventType: 'REQUEST_STATUS_CHANGED',
      requestId: '123',
      fromStatus: '<open>',
      targetStatus: { id: 'c', name: '<Done>', kind: 'completed' },
      actor: {
        id: 'u',
        username: 'u',
        displayName: '<Actor>',
        role: 'admin',
        setupOwnerDepartment: null,
      },
    };
    const result = renderRequestEmail(
      event,
      {
        request_no: 'PSF-1',
        requester: '<Requester>',
        product_type: '<Product>',
        requester_data_json: { description: '<script>x</script>' },
        psf_created_data_json: { secret: 'DO NOT SEND' },
      } as never,
      'http://localhost:3000',
    );
    expect(result.subject).toBe('[PSF Request] Completed: PSF-1 - -');
    expect(result.html).toContain('View Request');
    expect(result.html).toContain('&lt;Actor&gt;');
    expect(result.html).toContain('&lt;Requester&gt;');
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('DO NOT SEND');
    expect(result.html).toContain('/requests/123');
  });

  it('reads email summary fields through the captured canonical schema', () => {
    const result = renderRequestEmail(
      {
        eventType: 'REQUEST_SUBMITTED',
        requestId: '123',
        fromStatus: 'Draft',
        targetStatus: { id: 'b', name: 'B', kind: 'open' },
        actor: {
          id: 'u',
          username: 'u',
          displayName: 'User',
          role: 'requester',
          setupOwnerDepartment: null,
        },
      },
      {
        request_no: 'PSF-1',
        requester: 'Requester',
        product_type: null,
        requester_data_json: {
          custom_title: 'Captured title',
          custom_date: '2026-10-08',
          custom_product: 'IC',
        },
        schema_snapshot_json: {
          formKey: 'psf-request',
          version: 4,
          title: 'Custom form',
          sections: [
            {
              sectionKey: 'request',
              title: 'Request',
              fields: [
                {
                  fieldKey: 'custom_title',
                  canonicalKey: 'title',
                  label: 'Title',
                  type: 'text',
                },
                {
                  fieldKey: 'custom_date',
                  canonicalKey: 'due_date',
                  label: 'Due Date',
                  type: 'date',
                },
                {
                  fieldKey: 'custom_product',
                  canonicalKey: 'product_type',
                  label: 'Product',
                  type: 'text',
                },
              ],
            },
          ],
        },
      } as never,
      'http://localhost:3000',
    );
    expect(result.subject).toBe(
      '[PSF Request] New Request: PSF-1 - Captured title',
    );
    expect(result.html).toContain('2026-10-08');
    expect(result.html).toContain('<td>IC</td>');
  });

  it('has no Priority row, even when the request captured a priority', () => {
    const result = renderRequestEmail(
      statusChange(),
      importedFormRequest({ priority: 'Urgent' }),
      'http://localhost:3000',
    );
    expect(rowLabels(result.html)).not.toContain('Priority');
    expect(result.html).not.toContain('Urgent');
  });

  it('labels the title row Product Description, as the request tables do', () => {
    const result = renderRequestEmail(
      statusChange(),
      importedFormRequest(),
      'http://localhost:3000',
    );
    expect(rows(result.html)).toContainEqual(['Product Description', 'Chip A']);
    expect(rowLabels(result.html)).not.toContain('Title');
  });

  it('shows Product Type without its document hint, as the request tables do', () => {
    const result = renderRequestEmail(
      statusChange(),
      importedFormRequest(),
      'http://localhost:3000',
    );
    expect(rows(result.html)).toContainEqual([
      'Product Type',
      'Create new PSF',
    ]);
  });

  it('shows a Product Type the request tables do not recognise as stored', () => {
    const result = renderRequestEmail(
      statusChange(),
      importedFormRequest({ product_type: 'Legacy line (B2)' }),
      'http://localhost:3000',
    );
    expect(rows(result.html)).toContainEqual([
      'Product Type',
      'Legacy line (B2)',
    ]);
  });

  it('names who updated the request by their name only, without their role', () => {
    const result = renderRequestEmail(
      statusChange(),
      importedFormRequest(),
      'http://localhost:3000',
    );
    expect(rows(result.html)).toContainEqual(['Updated By', 'Somchai Jaidee']);
  });

  it('has no Reason / Remarks row when a request is cancelled', () => {
    const result = renderRequestEmail(
      statusChange({
        targetStatus: {
          id: 'x',
          name: '0% -- Rejected (Cancel Request)',
          kind: 'cancelled',
        },
      }),
      importedFormRequest({ reason: 'Duplicate', remarks: 'Old note' }),
      'http://localhost:3000',
    );
    expect(rowLabels(result.html)).not.toContain('Reason / Remarks');
    expect(result.html).not.toContain('Duplicate');
  });
});
