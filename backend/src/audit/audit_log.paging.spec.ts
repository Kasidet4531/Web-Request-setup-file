import { BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuditLogService } from './audit_log.service';

describe('AuditLogService.parsePage', () => {
  const service = new AuditLogService({} as Pool);

  it('defaults to 25 rows from offset 0', () => {
    expect(service.parsePage({})).toEqual({ limit: 25, offset: 0 });
  });

  it('accepts explicit digits and rejects bad pagination', () => {
    expect(service.parsePage({ limit: '50', offset: '100' })).toEqual({
      limit: 50,
      offset: 100,
    });
    for (const bad of [{ limit: '0' }, { limit: '101' }, { offset: '-1' }, { limit: 'x' }])
      expect(() => service.parsePage(bad)).toThrow(BadRequestException);
  });
});
