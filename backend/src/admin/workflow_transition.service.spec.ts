import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_POOL } from '../database/database.service';
import { WorkflowTransitionService } from './workflow_transition.service';

const MANUAL_STATUSES = [
  'Submitted',
  'Setup In Progress',
  'Need More Information',
  'PSF Created',
  'Completed',
  'Rejected',
  'Cancelled',
] as const;

type Transition = {
  fromStatus: string;
  toStatus: string;
  enabled: boolean;
  allowedRoles: string[];
  allowedSetupOwnerDepartments: string[];
};

function buildConfiguration(
  ruleOverrides: (
    fromStatus: string,
    toStatus: string,
  ) => Partial<Transition> = () => ({}),
): { transitions: Transition[] } {
  return {
    transitions: MANUAL_STATUSES.flatMap((fromStatus) =>
      MANUAL_STATUSES.filter((toStatus) => toStatus !== fromStatus).map(
        (toStatus) => ({
          fromStatus,
          toStatus,
          enabled: true,
          allowedRoles: ['admin'],
          allowedSetupOwnerDepartments: [],
          ...ruleOverrides(fromStatus, toStatus),
        }),
      ),
    ),
  };
}

function updateRule(
  configuration: { transitions: Transition[] },
  fromStatus: string,
  toStatus: string,
  patch: Partial<Transition>,
): { transitions: Transition[] } {
  return {
    transitions: configuration.transitions.map((transition) =>
      transition.fromStatus === fromStatus && transition.toStatus === toStatus
        ? { ...transition, ...patch }
        : transition,
    ),
  };
}

describe('WorkflowTransitionService', () => {
  let service: WorkflowTransitionService;
  let pool: { connect: jest.Mock; query: jest.Mock };
  let transactionClient: { query: jest.Mock; release: jest.Mock };
  let storedConfiguration: unknown;

  beforeEach(async () => {
    storedConfiguration = null;
    const executeQuery = (query: string, values?: unknown[]) => {
      if (query.includes('SELECT config_json')) {
        return Promise.resolve({
          rows:
            storedConfiguration === null
              ? []
              : [{ config_json: storedConfiguration }],
        });
      }

      if (query.includes('INSERT INTO workflow_transition_config')) {
        const nextConfiguration = values?.[1];
        if (query.includes('DO NOTHING')) {
          storedConfiguration ??= nextConfiguration ?? null;
        } else {
          storedConfiguration = nextConfiguration ?? null;
        }

        return Promise.resolve({
          rows: query.includes('RETURNING')
            ? [{ config_json: storedConfiguration }]
            : [],
        });
      }

      return Promise.resolve({ rows: [] });
    };

    transactionClient = {
      query: jest.fn((query: string, values?: unknown[]) => {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
          return Promise.resolve({ rows: [] });
        }

        return executeQuery(query, values);
      }),
      release: jest.fn(),
    };
    pool = {
      connect: jest.fn().mockResolvedValue(transactionClient),
      query: jest.fn(executeQuery),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTransitionService,
        { provide: DATABASE_POOL, useValue: pool },
      ],
    }).compile();

    service = module.get(WorkflowTransitionService);
  });

  it('seeds the existing requester, Setup File Owner, and administrator behavior only when no configuration exists', async () => {
    await service.onModuleInit();

    const seededConfiguration = storedConfiguration as {
      transitions: Transition[];
    };
    expect(seededConfiguration.transitions).toHaveLength(42);
    const requesterCancellation = seededConfiguration.transitions.find(
      (transition) =>
        transition.fromStatus === 'Submitted' &&
        transition.toStatus === 'Cancelled',
    );
    expect(requesterCancellation).toMatchObject({
      enabled: true,
    });
    expect(requesterCancellation?.allowedRoles).toEqual(
      expect.arrayContaining(['admin', 'requester']),
    );
    const setupOwnerStart = seededConfiguration.transitions.find(
      (transition) =>
        transition.fromStatus === 'Submitted' &&
        transition.toStatus === 'Setup In Progress',
    );
    expect(setupOwnerStart).toMatchObject({
      enabled: true,
    });
    expect(setupOwnerStart?.allowedRoles).toEqual(
      expect.arrayContaining(['admin', 'setup_owner']),
    );

    await expect(
      service.getAllowedNextStatuses(
        {
          id: 'requester-1',
          username: 'requester.demo',
          displayName: 'Requester Demo',
          role: 'requester',
          setupOwnerDepartment: null,
        },
        'Submitted',
      ),
    ).resolves.toEqual(['Cancelled']);
    await expect(
      service.getAllowedNextStatuses(
        {
          id: 'setup-owner-1',
          username: 'setup.gntc.demo',
          displayName: 'Setup Owner GNTC Demo',
          role: 'setup_owner',
          setupOwnerDepartment: 'GNTC',
        },
        'Submitted',
      ),
    ).resolves.toEqual([
      'Setup In Progress',
      'Need More Information',
      'Rejected',
    ]);
    await expect(
      service.getAllowedNextStatuses(
        {
          id: 'admin-1',
          username: 'admin.demo',
          displayName: 'Admin Demo',
          role: 'admin',
          setupOwnerDepartment: null,
        },
        'Submitted',
      ),
    ).resolves.toEqual([
      'Setup In Progress',
      'Need More Information',
      'PSF Created',
      'Completed',
      'Rejected',
      'Cancelled',
    ]);

    const savedByAdmin = buildConfiguration(() => ({
      enabled: false,
      allowedRoles: [],
    }));
    storedConfiguration = savedByAdmin;

    await service.onModuleInit();

    expect(storedConfiguration).toEqual(savedByAdmin);
  });

  it('atomically replaces the complete configuration after validating it', async () => {
    const replacement = updateRule(
      buildConfiguration(),
      'Submitted',
      'Setup In Progress',
      {
        allowedRoles: [],
        allowedSetupOwnerDepartments: ['GNTC'],
      },
    );

    const savedConfiguration = await service.replaceConfiguration(replacement);
    expect(savedConfiguration.statuses).toEqual(MANUAL_STATUSES);
    expect(
      savedConfiguration.transitions.find(
        (transition: Transition) =>
          transition.fromStatus === 'Submitted' &&
          transition.toStatus === 'Setup In Progress',
      ),
    ).toMatchObject({
      fromStatus: 'Submitted',
      toStatus: 'Setup In Progress',
      allowedRoles: [],
      allowedSetupOwnerDepartments: ['GNTC'],
    });

    expect(transactionClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workflow_transition_config'),
      expect.arrayContaining([replacement]),
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
    expect(storedConfiguration).toEqual(replacement);
  });

  it('matches a Setup File Owner department when no role is selected and denies every other actor', async () => {
    const disabledConfiguration = buildConfiguration(() => ({
      enabled: false,
      allowedRoles: [],
      allowedSetupOwnerDepartments: [],
    }));
    const departmentRule = updateRule(
      disabledConfiguration,
      'Submitted',
      'Setup In Progress',
      {
        enabled: true,
        allowedSetupOwnerDepartments: ['GNTC'],
      },
    );

    await service.replaceConfiguration(departmentRule);

    await expect(
      service.getAllowedNextStatuses(
        {
          id: 'setup-owner-gntc',
          username: 'setup.gntc.demo',
          displayName: 'GNTC Owner',
          role: 'setup_owner',
          setupOwnerDepartment: 'GNTC',
        },
        'Submitted',
      ),
    ).resolves.toEqual(['Setup In Progress']);
    await expect(
      service.getAllowedNextStatuses(
        {
          id: 'setup-owner-mfg',
          username: 'setup.mfg.demo',
          displayName: 'MFG Owner',
          role: 'setup_owner',
          setupOwnerDepartment: 'MFG',
        },
        'Submitted',
      ),
    ).resolves.toEqual([]);
    await expect(
      service.getAllowedNextStatuses(
        {
          id: 'admin-1',
          username: 'admin.demo',
          displayName: 'Admin Demo',
          role: 'admin',
          setupOwnerDepartment: null,
        },
        'Submitted',
      ),
    ).resolves.toEqual([]);
  });

  it.each([
    {
      description: 'a duplicate directed transition',
      configuration: () => {
        const valid = buildConfiguration();
        return { transitions: [...valid.transitions, valid.transitions[0]] };
      },
    },
    {
      description: 'a missing directed transition',
      configuration: () => ({
        transitions: buildConfiguration().transitions.slice(1),
      }),
    },
    {
      description: 'a Draft transition',
      configuration: () =>
        updateRule(buildConfiguration(), 'Submitted', 'Setup In Progress', {
          fromStatus: 'Draft',
        }),
    },
    {
      description: 'a self transition',
      configuration: () =>
        updateRule(buildConfiguration(), 'Submitted', 'Setup In Progress', {
          toStatus: 'Submitted',
        }),
    },
    {
      description: 'an unknown role',
      configuration: () =>
        updateRule(buildConfiguration(), 'Submitted', 'Setup In Progress', {
          allowedRoles: ['workflow_manager'],
        }),
    },
    {
      description: 'an unknown Setup File Owner department',
      configuration: () =>
        updateRule(buildConfiguration(), 'Submitted', 'Setup In Progress', {
          allowedSetupOwnerDepartments: ['Engineering'],
        }),
    },
  ])(
    'rejects $description before opening a write transaction',
    async ({ configuration }) => {
      await expect(
        service.replaceConfiguration(configuration()),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(pool.connect).not.toHaveBeenCalled();
    },
  );
});
