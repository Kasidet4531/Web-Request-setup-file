import { SaxesParser } from 'saxes';
import type { MailConfig } from './mail.config';
export const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const SERVICE_NS = 'http://tempuri.org/';
export interface MailMessage {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
}
export function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
export function safeMailError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .split(/\r?\n/)[0]
    .slice(0, 500);
}
export function buildSoapEnvelope(
  config: MailConfig,
  message: MailMessage,
): string {
  const fields = {
    i_strSystemName: config.systemName,
    i_strServer: config.smtpServer,
    i_strPort: config.smtpPort,
    i_strFrom: config.from,
    i_strTo: message.to,
    i_strCC: message.cc,
    i_strBCC: message.bcc,
    i_strSubject: message.subject,
  };
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="${SOAP_NS}"><soap:Body><SendMail xmlns="${SERVICE_NS}">${Object.entries(
    fields,
  )
    .map(([key, value]) => `<${key}>${xmlEscape(value)}</${key}>`)
    .join(
      '',
    )}<i_strBody><![CDATA[${message.html.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></i_strBody></SendMail></soap:Body></soap:Envelope>`;
}
export function validateSoapResponse(xml: string, status: number): void {
  if (xml.length > 1_000_000 || /<!DOCTYPE/i.test(xml))
    throw new Error('Invalid SOAP XML');
  const parser = new SaxesParser({ xmlns: true });
  const stack: { local: string; uri: string }[] = [];
  let response = false;
  let fault = false;
  let faultText = '';
  let envelope = false;
  let body = false;
  parser.on('opentag', (tag) => {
    if (stack.length === 0)
      envelope = tag.local === 'Envelope' && tag.uri === SOAP_NS;
    if (
      stack.length === 1 &&
      envelope &&
      tag.local === 'Body' &&
      tag.uri === SOAP_NS
    )
      body = true;
    if (
      envelope &&
      stack.length >= 2 &&
      stack[1].local === 'Body' &&
      stack[1].uri === SOAP_NS &&
      tag.local === 'Fault' &&
      tag.uri === SOAP_NS
    )
      fault = true;
    if (
      stack.length === 2 &&
      stack[1].local === 'Body' &&
      stack[1].uri === SOAP_NS &&
      envelope
    ) {
      if (tag.local === 'Fault' && tag.uri === SOAP_NS) fault = true;
      if (tag.local === 'SendMailResponse' && tag.uri === SERVICE_NS)
        response = true;
    }
    stack.push({ local: tag.local, uri: tag.uri });
  });
  const text = (value: string) => {
    if (
      fault &&
      stack.some((tag) => tag.local === 'Fault' && tag.uri === SOAP_NS) &&
      stack.at(-1)?.local === 'faultstring'
    )
      faultText += value;
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('error', () => {
    throw new Error('Invalid SOAP XML');
  });
  parser.write(xml).close();
  if (fault) throw new Error(safeMailError(faultText || 'SOAP Fault'));
  if (status < 200 || status >= 300) throw new Error(`SOAP HTTP ${status}`);
  if (!envelope || !body || !response)
    throw new Error('Missing SOAP SendMailResponse');
}
