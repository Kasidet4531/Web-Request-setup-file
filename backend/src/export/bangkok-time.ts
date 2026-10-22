// Exports show times in the system's time zone, Asia/Bangkok (ADR 0013).
const BANGKOK_DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface BangkokDateTime {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

export function bangkokDateTime(date: Date): BangkokDateTime {
  const parts: Record<string, string> = {};
  for (const { type, value } of BANGKOK_DATE_TIME.formatToParts(date))
    parts[type] = value;
  const { year, month, day, hour, minute, second } = parts;
  return { year, month, day, hour, minute, second };
}
