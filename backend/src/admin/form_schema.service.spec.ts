import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_POOL } from '../database/database.service';
import { FormSchemaService } from './form_schema.service';

describe('FormSchemaService', () => {
  const pool = {
    query: jest.fn(),
  };

  let service: FormSchemaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormSchemaService,
        {
          provide: DATABASE_POOL,
          useValue: pool,
        },
      ],
    }).compile();

    service = module.get(FormSchemaService);
  });

  it('creates form_definitions storage and seeds the default active PSF request schema', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await service.onModuleInit();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS form_definitions'),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('idx_form_definitions_active_form_key'),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO form_definitions'),
      expect.arrayContaining([
        'psf-request',
        1,
        'PSF Request Form',
        'active',
        'system-seed',
        expect.objectContaining({
          formKey: 'psf-request',
          version: 1,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          sections: expect.arrayContaining([
            expect.objectContaining({
              sectionKey: 'requester_information',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              fields: expect.arrayContaining([
                expect.objectContaining({
                  fieldKey: 'product_type',
                  type: 'radio',
                  required: true,
                  options: [
                    'New Product',
                    'Transfer Product',
                    'Existing Product',
                  ],
                }),
                expect.objectContaining({ fieldKey: 'title', required: true }),
                expect.objectContaining({
                  fieldKey: 'probecard_name',
                  required: true,
                }),
              ]),
            }),
          ]),
        }),
      ]),
    );
  });

  it('returns the active schema using the public API response shape', async () => {
    const schemaJson = {
      formKey: 'psf-request',
      version: 1,
      sections: [],
    };
    pool.query.mockResolvedValue({
      rows: [
        {
          form_key: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          description: 'Requester-facing MVP schema',
          status: 'active',
          schema_json: schemaJson,
          published_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.getActiveSchema('psf-request')).resolves.toEqual({
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request Form',
      description: 'Requester-facing MVP schema',
      status: 'active',
      schema: schemaJson,
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('raises NotFoundException when no active schema exists for a form key', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await expect(
      service.getActiveSchema('missing-form'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
