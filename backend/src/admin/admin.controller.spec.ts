import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { FormSchemaService } from './form_schema.service';

describe('AdminController', () => {
  it('exposes an API to fetch the active PSF request schema', async () => {
    const activeSchema = {
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request Form',
      description: 'Requester-facing MVP schema',
      status: 'active',
      schema: { formKey: 'psf-request', version: 1, sections: [] },
      publishedAt: '2026-01-01T00:00:00.000Z',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: FormSchemaService,
          useValue: {
            getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
          },
        },
      ],
    }).compile();

    const controller = module.get(AdminController);

    await expect(
      controller.getActiveFormSchema('psf-request'),
    ).resolves.toEqual(activeSchema);
  });
});
