export const MAIL_FROM = 'noreply-psf@nxp.com';
export function emailAddresses(value: string): string[] {
  const addresses = value
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (
    addresses.some(
      (item) =>
        !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(item) ||
        /[\r\n]/.test(item),
    )
  )
    throw new Error('Invalid mail recipient');
  return [...new Set(addresses)];
}
export class MailConfig {
  readonly enabled: boolean;
  readonly from = MAIL_FROM;
  readonly soapUrl: string;
  readonly smtpServer: string;
  readonly smtpPort: number;
  readonly systemName: string;
  readonly defaultTo: string[];
  readonly adminTo: string[];
  readonly redirectTo: string[];
  readonly baseUrl: string;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  constructor(env: Record<string, string | undefined>) {
    const flag = env.MAIL_ENABLED?.trim().toLowerCase() ?? 'false';
    if (!['true', 'false'].includes(flag))
      throw new Error('MAIL_ENABLED must be true or false');
    this.enabled = flag === 'true';
    const integer = (key: string, fallback: number, max: number) => {
      const raw = env[key];
      const n = raw === undefined || raw === '' ? fallback : Number(raw);
      if (!Number.isInteger(n) || n <= 0 || n > max)
        throw new Error(`${key} must be a positive integer <= ${max}`);
      return n;
    };
    this.pollIntervalMs = integer('MAIL_POLL_INTERVAL_MS', 15_000, 300_000);
    this.timeoutMs = integer('MAIL_TIMEOUT_MS', 10_000, 120_000);
    this.smtpPort = integer('MAIL_SMTP_PORT', 25, 65_535);
    this.soapUrl = env.MAIL_SOAP_URL?.trim() ?? '';
    this.smtpServer = env.MAIL_SMTP_SERVER?.trim() ?? '';
    this.systemName = env.MAIL_SYSTEM_NAME?.trim() || 'PSF Setup File';
    this.defaultTo = emailAddresses(env.MAIL_DEFAULT_TO ?? '');
    this.adminTo = emailAddresses(
      env.MAIL_ADMIN_TO ?? env.MAIL_DEFAULT_TO ?? '',
    );
    this.redirectTo = emailAddresses(env.MAIL_REDIRECT_TO ?? '');
    this.baseUrl = (env.APP_BASE_URL?.trim() ?? '').replace(/\/$/, '');
    if (this.baseUrl) this.validateUrl(this.baseUrl, 'APP_BASE_URL');
    if (this.soapUrl) this.validateUrl(this.soapUrl, 'MAIL_SOAP_URL');
    if (!this.enabled) return;
    if (
      !this.soapUrl ||
      !this.smtpServer ||
      !this.defaultTo.length ||
      !this.adminTo.length ||
      !this.baseUrl
    )
      throw new Error(
        'Enabled mail requires MAIL_SOAP_URL, MAIL_SMTP_SERVER, MAIL_DEFAULT_TO and APP_BASE_URL',
      );
    if (env.NODE_ENV !== 'production' && !this.redirectTo.length)
      throw new Error('Non-production mail requires MAIL_REDIRECT_TO');
    if (env.NODE_ENV === 'production') {
      const host = new URL(this.baseUrl).hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '');
      // URL canonicalizes mapped IPv4 addresses into two hexadecimal words.
      const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
      const mappedLocal =
        mapped !== null &&
        (Number.parseInt(mapped[1], 16) >>> 8 === 127 ||
          (Number.parseInt(mapped[1], 16) === 0 &&
            Number.parseInt(mapped[2], 16) === 0));
      if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === '0.0.0.0' ||
        /^127\./.test(host) ||
        host === '::1' ||
        host === '::' ||
        mappedLocal
      )
        throw new Error('Production APP_BASE_URL cannot use loopback');
    }
  }
  private validateUrl(value: string, key: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${key} must be an HTTP(S) URL`);
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new Error(
        `${key} must be an HTTP(S) URL without credentials, query or fragment`,
      );
  }
}
