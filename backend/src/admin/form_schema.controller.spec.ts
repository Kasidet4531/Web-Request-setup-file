import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { FormSchemaService } from './form_schema.service';
import { FormSchemaController } from './form_schema.controller';

const PSF_REQUEST_FORM_KEY = 'psf-request';

const validSchema = {
  formKey: PSF_REQUEST_FORM_KEY,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester', 'setup_owner', 'admin'],
      fields: [],
    },
  ],
};

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

describe('FormSchemaController', () => {
  let controller: FormSchemaController;
  let formSchemaService: {
    listVersions: jest.Mock;
    publishDraft: jest.Mock;
    saveDraft: jest.Mock;
  };
  let authService: { getProfile: jest.Mock };

  beforeEach(async () => {
    formSchemaService = {
      listVersions: jest.fn(),
      publishDraft: jest.fn(),
      saveDraft: jest.fn(),
    };
    authService = { getProfile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormSchemaController],
      providers: [
        { provide: FormSchemaService, useValue: formSchemaService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    controller = module.get(FormSchemaController);
  });

  it('uses the authenticated server profile to list form schema versions for an admin', async () => {
    const response = {
      formKey: PSF_REQUEST_FORM_KEY,
      versions: [{ version: 1, status: 'active' }],
    };
    authService.getProfile.mockResolvedValue(adminActor);
    formSchemaService.listVersions.mockResolvedValue(response);

    await expect(
      controller.getFormConfig({ session: { userId: 'admin-1' } } as never),
    ).resolves.toEqual(response);

    expect(authService.getProfile).toHaveBeenCalledWith('admin-1');
    expect(formSchemaService.listVersions).toHaveBeenCalledWith();
  });

  it('saves a draft for an admin while stripping caller-owned authority fields', async () => {
    const response = {
      formKey: PSF_REQUEST_FORM_KEY,
      version: 2,
      status: 'draft',
    };
    const sections = validSchema.sections;
    authService.getProfile.mockResolvedValue(adminActor);
    formSchemaService.saveDraft.mockResolvedValue(response);

    await expect(
      controller.saveDraft(
        {
          description: 'Editable draft',
          schema: {
            ...validSchema,
            title: '  PSF Request Form  ',
            version: 999,
            status: 'active',
            createdBy: 'client-controlled',
            createdAt: '2026-01-01T00:00:00.000Z',
            publishedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        { session: { userId: 'admin-1' } } as never,
      ),
    ).resolves.toEqual(response);

    expect(formSchemaService.saveDraft).toHaveBeenCalledWith(
      {
        description: 'Editable draft',
        schema: {
          formKey: PSF_REQUEST_FORM_KEY,
          title: 'PSF Request Form',
          sections,
        },
      },
      adminActor,
    );
  });

  it('publishes a selected draft version for an admin', async () => {
    const response = {
      formKey: PSF_REQUEST_FORM_KEY,
      version: 2,
      status: 'active',
    };
    authService.getProfile.mockResolvedValue(adminActor);
    formSchemaService.publishDraft.mockResolvedValue(response);

    await expect(
      controller.publishDraft({ version: 2 }, {
        session: { userId: 'admin-1' },
      } as never),
    ).resolves.toEqual(response);

    expect(formSchemaService.publishDraft).toHaveBeenCalledWith(2);
  });

  it('rejects a missing session before reading form schema versions', async () => {
    await expect(
      controller.getFormConfig({ session: {} } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.getProfile).not.toHaveBeenCalled();
    expect(formSchemaService.listVersions).not.toHaveBeenCalled();
  });

  it('clears a stale session before saving a form schema draft', async () => {
    const request = { session: { userId: 'stale-user' } };
    authService.getProfile.mockResolvedValue(null);

    await expect(
      controller.saveDraft({ schema: validSchema }, request as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(request.session.userId).toBeUndefined();
    expect(formSchemaService.saveDraft).not.toHaveBeenCalled();
  });

  it.each([
    {
      actor: {
        id: 'requester-1',
        username: 'requester.demo',
        displayName: 'Requester Demo',
        role: 'requester' as const,
        setupOwnerDepartment: null,
      },
      role: 'requester',
    },
    {
      actor: {
        id: 'setup-owner-1',
        username: 'setup.gntc.demo',
        displayName: 'Setup Owner GNTC Demo',
        role: 'setup_owner' as const,
        setupOwnerDepartment: 'GNTC' as const,
      },
      role: 'setup owner',
    },
  ])(
    'rejects a $role before any form schema service call',
    async ({ actor }) => {
      authService.getProfile.mockResolvedValue(actor);
      const request = { session: { userId: actor.id } } as never;

      await expect(controller.getFormConfig(request)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        controller.saveDraft({ schema: validSchema }, request),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        controller.publishDraft({ version: 2 }, request),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(formSchemaService.listVersions).not.toHaveBeenCalled();
      expect(formSchemaService.saveDraft).not.toHaveBeenCalled();
      expect(formSchemaService.publishDraft).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { schema: null },
    { schema: { ...validSchema, formKey: 'another-form' } },
    { schema: { ...validSchema, title: '   ' } },
    { schema: { ...validSchema, sections: {} } },
    { description: 42, schema: validSchema },
  ])('rejects malformed draft input before saving it', async (body) => {
    authService.getProfile.mockResolvedValue(adminActor);

    await expect(
      controller.saveDraft(body, { session: { userId: 'admin-1' } } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(formSchemaService.saveDraft).not.toHaveBeenCalled();
  });

  it.each([
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: '2' },
    {},
  ])(
    'rejects an invalid publish version before publishing it',
    async (body) => {
      authService.getProfile.mockResolvedValue(adminActor);

      await expect(
        controller.publishDraft(body, {
          session: { userId: 'admin-1' },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(formSchemaService.publishDraft).not.toHaveBeenCalled();
    },
  );
});
