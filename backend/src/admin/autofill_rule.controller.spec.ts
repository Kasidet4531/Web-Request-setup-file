import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { AutofillRuleController } from './autofill_rule.controller';
import { AutofillRuleService } from './autofill_rule.service';

const adminActor = {
  id: 'admin-1',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};

const rule = {
  id: 'b8a65f09-4a13-40de-a0a4-8a969b32e085',
  formKey: 'psf-request',
  triggerCanonicalKey: 'reference_psf_name',
  targetCanonicalKeys: ['product', 'wafer_fab'],
  lookupSource: 'previous_completed_submission' as const,
  status: 'active' as const,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:00.000Z',
};

const input = {
  formKey: 'psf-request',
  triggerCanonicalKey: 'reference_psf_name',
  targetCanonicalKeys: ['product', 'wafer_fab'],
};

describe('AutofillRuleController', () => {
  let authService: { getProfile: jest.Mock };
  let autofillRuleService: {
    createRule: jest.Mock;
    listActiveRules: jest.Mock;
    updateRule: jest.Mock;
  };
  let controller: AutofillRuleController;

  beforeEach(async () => {
    authService = { getProfile: jest.fn() };
    autofillRuleService = {
      createRule: jest.fn(),
      listActiveRules: jest.fn(),
      updateRule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutofillRuleController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AutofillRuleService, useValue: autofillRuleService },
      ],
    }).compile();

    controller = module.get(AutofillRuleController);
  });

  it('lists active rules only after resolving the current administrator profile', async () => {
    authService.getProfile.mockResolvedValue(adminActor);
    autofillRuleService.listActiveRules.mockResolvedValue([rule]);

    await expect(
      controller.listRules({ session: { userId: adminActor.id } } as never),
    ).resolves.toEqual([rule]);

    expect(authService.getProfile).toHaveBeenCalledWith(adminActor.id);
    expect(autofillRuleService.listActiveRules).toHaveBeenCalledWith(
      'psf-request',
    );
  });

  it('creates and edits complete canonical rule bodies only for an administrator', async () => {
    const updatedRule = {
      ...rule,
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
    };
    authService.getProfile.mockResolvedValue(adminActor);
    autofillRuleService.createRule.mockResolvedValue(rule);
    autofillRuleService.updateRule.mockResolvedValue(updatedRule);

    await expect(
      controller.createRule(input, {
        session: { userId: adminActor.id },
      } as never),
    ).resolves.toEqual(rule);
    await expect(
      controller.updateRule(
        rule.id,
        {
          formKey: 'psf-request',
          triggerCanonicalKey: 'reference_product',
          targetCanonicalKeys: ['product'],
        },
        { session: { userId: adminActor.id } } as never,
      ),
    ).resolves.toEqual(updatedRule);

    expect(autofillRuleService.createRule).toHaveBeenCalledWith(input);
    expect(autofillRuleService.updateRule).toHaveBeenCalledWith(rule.id, {
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
    });
  });

  it('rejects a missing or stale session before accessing rule storage', async () => {
    await expect(
      controller.listRules({ session: {} } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.getProfile).not.toHaveBeenCalled();

    const staleRequest = { session: { userId: 'missing-user' } };
    authService.getProfile.mockResolvedValue(null);
    await expect(
      controller.createRule(input, staleRequest as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(staleRequest.session.userId).toBeUndefined();
    expect(autofillRuleService.createRule).not.toHaveBeenCalled();
  });

  it.each([
    {
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester' as const,
      setupOwnerDepartment: null,
    },
    {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    },
  ])('rejects $role callers before rule storage calls', async (actor) => {
    authService.getProfile.mockResolvedValue(actor);
    const request = { session: { userId: actor.id } } as never;

    await expect(controller.listRules(request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.createRule(input, request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      controller.updateRule(rule.id, input, request),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(autofillRuleService.listActiveRules).not.toHaveBeenCalled();
    expect(autofillRuleService.createRule).not.toHaveBeenCalled();
    expect(autofillRuleService.updateRule).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { ...input, unexpected: true },
    { formKey: 'psf-request', targetCanonicalKeys: ['product'] },
  ])('rejects malformed rule envelopes before writing', async (body) => {
    authService.getProfile.mockResolvedValue(adminActor);

    await expect(
      controller.createRule(body, {
        session: { userId: adminActor.id },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(autofillRuleService.createRule).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID edit path before rule storage calls', async () => {
    authService.getProfile.mockResolvedValue(adminActor);

    await expect(
      controller.updateRule('not-a-uuid', input, {
        session: { userId: adminActor.id },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(autofillRuleService.updateRule).not.toHaveBeenCalled();
  });
});
