import { Test, TestingModule } from '@nestjs/testing';
import { FormSchemaService } from '../admin/form_schema.service';
import { FormsController } from './forms.controller';

describe('FormsController', () => {
  it('exposes the active PSF request schema through the requester-facing forms API', async () => {
    const activeSchema = {
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request Form',
      description: 'Requester-facing MVP schema',
      status: 'active',
      schema: { formKey: 'psf-request', version: 1, sections: [] },
      publishedAt: '2026-01-01T00:00:00.000Z',
    };
    const formSchemaService = {
      getActiveSchema: jest.fn().mockResolvedValue(activeSchema),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormsController],
      providers: [
        {
          provide: FormSchemaService,
          useValue: formSchemaService,
        },
      ],
    }).compile();

    const controller = module.get(FormsController);

    await expect(
      controller.getActiveFormSchema('psf-request'),
    ).resolves.toEqual(activeSchema);
    expect(formSchemaService.getActiveSchema).toHaveBeenCalledWith(
      'psf-request',
    );
  });
});
