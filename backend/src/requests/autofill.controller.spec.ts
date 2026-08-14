import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { AutofillController } from './autofill.controller';
import { AutofillService } from './autofill.service';

const requesterActor = {
  id: 'requester-1',
  username: 'requester.demo',
  displayName: 'Requester Demo',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

describe('AutofillController', () => {
  let authService: { getProfile: jest.Mock };
  let autofillService: { lookupSuggestions: jest.Mock };
  let controller: AutofillController;

  beforeEach(async () => {
    authService = { getProfile: jest.fn() };
    autofillService = { lookupSuggestions: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutofillController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AutofillService, useValue: autofillService },
      ],
    }).compile();
    controller = module.get(AutofillController);
  });

  it.each([requesterActor, adminActor])(
    'allows an authenticated $role to retrieve a minimal lookup response using normalized scalar query values',
    async (actor) => {
      authService.getProfile.mockResolvedValue(actor);
      autofillService.lookupSuggestions.mockResolvedValue({
        matched: true,
        suggestedValues: { product: 'New Product' },
      });

      await expect(
        controller.lookup(
          {
            formKey: ' psf-request ',
            field: ' reference_psf_name ',
            value: ' REF-PSF-1 ',
          },
          { session: { userId: actor.id } } as never,
        ),
      ).resolves.toEqual({
        matched: true,
        suggestedValues: { product: 'New Product' },
      });

      expect(autofillService.lookupSuggestions).toHaveBeenCalledWith({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF-PSF-1',
      });
    },
  );

  it('rejects missing and stale sessions before the runtime lookup service is called', async () => {
    await expect(
      controller.lookup(
        {
          formKey: 'psf-request',
          field: 'reference_psf_name',
          value: 'REF-PSF-1',
        },
        { session: {} } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.getProfile).not.toHaveBeenCalled();

    const staleRequest = { session: { userId: 'missing-user' } };
    authService.getProfile.mockResolvedValue(null);
    await expect(
      controller.lookup(
        {
          formKey: 'psf-request',
          field: 'reference_psf_name',
          value: 'REF-PSF-1',
        },
        staleRequest as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(staleRequest.session.userId).toBeUndefined();
    expect(autofillService.lookupSuggestions).not.toHaveBeenCalled();
  });

  it('rejects Setup File Owners using the requester-draft lookup before service access', async () => {
    authService.getProfile.mockResolvedValue({
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });

    await expect(
      controller.lookup(
        {
          formKey: 'psf-request',
          field: 'reference_psf_name',
          value: 'REF-PSF-1',
        },
        { session: { userId: 'setup-owner-1' } } as never,
      ),
    ).rejects.toMatchObject({
      message: 'Setup File Owners cannot edit requester-owned fields',
    });

    expect(autofillService.lookupSuggestions).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an unknown query key',
      {
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF',
        extra: 'x',
      },
    ],
    ['a missing form key', { field: 'reference_psf_name', value: 'REF' }],
    ['a missing field', { formKey: 'psf-request', value: 'REF' }],
    [
      'a missing value',
      { formKey: 'psf-request', field: 'reference_psf_name' },
    ],
    [
      'a repeated form key',
      {
        formKey: ['psf-request', 'psf-request'],
        field: 'reference_psf_name',
        value: 'REF',
      },
    ],
    [
      'a repeated field',
      {
        formKey: 'psf-request',
        field: ['reference_psf_name', 'product'],
        value: 'REF',
      },
    ],
    [
      'a repeated value',
      {
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: ['REF', 'OTHER'],
      },
    ],
    [
      'an object field',
      {
        formKey: 'psf-request',
        field: { value: 'reference_psf_name' },
        value: 'REF',
      },
    ],
    [
      'a blank form key',
      { formKey: ' ', field: 'reference_psf_name', value: 'REF' },
    ],
    [
      'an unmanaged form key',
      { formKey: 'other-form', field: 'reference_psf_name', value: 'REF' },
    ],
    ['a blank field', { formKey: 'psf-request', field: ' ', value: 'REF' }],
    [
      'a blank value',
      { formKey: 'psf-request', field: 'reference_psf_name', value: ' ' },
    ],
  ])(
    'rejects %s at the scalar query trust boundary before authentication or service access',
    async (_description, query) => {
      await expect(
        controller.lookup(query, {
          session: { userId: requesterActor.id },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(authService.getProfile).not.toHaveBeenCalled();
      expect(autofillService.lookupSuggestions).not.toHaveBeenCalled();
    },
  );

  it('does not transform no-match responses into an error', async () => {
    authService.getProfile.mockResolvedValue(requesterActor);
    autofillService.lookupSuggestions.mockResolvedValue({
      matched: false,
      suggestedValues: {},
    });

    await expect(
      controller.lookup(
        {
          formKey: 'psf-request',
          field: 'reference_psf_name',
          value: 'REF-PSF-1',
        },
        { session: { userId: requesterActor.id } } as never,
      ),
    ).resolves.toEqual({ matched: false, suggestedValues: {} });
  });
});
