import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect } from 'playwright/test';
import { startEmailSystem, loginPage, api } from './email-system.fixture.mjs';

const require = createRequire(import.meta.url);
let system;
const identities = [
  ['draft.creator', 'Draft Creator', 'creator@nxp.com'],
  ['draft.other', 'Other Requester', 'other@nxp.com'],
  ['draft.gntc', 'GNTC Engineer', 'gntc@nxp.com'],
  ['draft.mfg', 'MFG Engineer', 'mfg@nxp.com'],
  ['draft.admin', 'Second Admin', 'second-admin@nxp.com'],
];
before(
  async () => {
    system = await startEmailSystem({
      users: identities.map(([username, name, email]) => ({
        username,
        password: 'offline-only',
        profile: { name, email, employeeId: username, title: 'Engineer' },
      })),
    });
  },
  { timeout: 60_000 },
);
after(async () => {
  if (system) await system.close();
});

async function sessions(t) {
  const admin = await loginPage(system, t);
  const pages = {};
  for (const [username] of identities) {
    pages[username.split('.')[1]] = await loginPage(system, t, [], {
      username,
      password: 'offline-only',
    });
  }
  const accounts = await api(admin, 'GET', '/admin/users');
  for (const [username, role, dept] of [
    ['draft.gntc', 'setup_owner', 'GNTC'],
    ['draft.mfg', 'setup_owner', 'MFG'],
    ['draft.admin', 'admin', null],
  ]) {
    const account = accounts.find((item) => item.username === username);
    await api(admin, 'PUT', `/admin/users/${account.id}`, {
      role,
      setupOwnerDepartment: dept,
    });
  }
  return { admin, ...pages };
}

async function draft(page, title, productType = 'New Product') {
  return api(page, 'POST', '/requests', {
    requesterData: {
      product_type: productType,
      title,
      priority: 'Normal',
      due_date: '2030-01-01',
      product: 'Lifecycle product',
      wafer_fab: 'Lifecycle FAB',
      probecard_name: 'Lifecycle probecard',
    },
  });
}

async function submit(page, request) {
  const statuses = await api(page, 'GET', '/workflow/statuses');
  const status = statuses.entries.find((entry) => entry.kind === 'open').name;
  return api(page, 'POST', `/requests/${request.id}/submit`, {
    status,
    formVersion: request.formVersion,
    expectedUpdatedAt: request.updatedAt,
  });
}

function reminderScanner() {
  const {
    DraftReminderService,
  } = require('../dist/notifications/draft-reminder.service.js');
  const {
    NotificationStorage,
  } = require('../dist/notifications/notification.storage.js');
  const { MailConfig } = require('../dist/notifications/mail.config.js');
  return new DraftReminderService(
    system.database,
    new NotificationStorage(system.database),
    new MailConfig({ APP_BASE_URL: system.origin }),
  );
}

test(
  'Admin reads foreign Drafts without mutation rights; creator/Admin permanent deletion purges retained content',
  { timeout: 90_000 },
  async (t) => {
    const { admin, creator, other } = await sessions(t);
    const request = await draft(
      creator,
      'Private draft payload deletion check',
    );
    const denied = await other.request.get(
      `${system.origin}/api/requests/${request.id}`,
    );
    assert.equal(denied.status(), 403);
    const adminView = await api(admin, 'GET', `/admin/drafts/${request.id}`);
    assert.equal(adminView.canEditRequesterData, false);
    assert.equal(adminView.canEditPsfCreatedData, false);
    const forbiddenWrite = await admin.request.put(
      `${system.origin}/api/requests/${request.id}/requester-data`,
      {
        data: {
          formVersion: request.formVersion,
          expectedUpdatedAt: request.updatedAt,
          requesterData: request.requesterData,
        },
      },
    );
    assert.equal(forbiddenWrite.status(), 403);
    const {
      ExportJobRepository,
    } = require('../dist/export/export-job.repository.js');
    const actor = (await api(creator, 'GET', '/me')).user;
    const job = await new ExportJobRepository(system.database).enqueue(
      { status: 'Draft' },
      actor,
    );
    await expect
      .poll(
        async () =>
          (await api(creator, 'GET', `/requests/export-jobs/${job.id}`)).status,
      )
      .toBe('completed');
    const exported = await creator.request.get(
      `${system.origin}/api/requests/export-jobs/${job.id}/download`,
    );
    assert.equal(exported.status(), 200);
    await admin.goto(`${system.origin}/admin/drafts`);
    await expect(
      admin.getByRole('heading', { name: 'Draft Management', exact: true }),
    ).toBeVisible();
    await admin
      .getByRole('textbox', { name: 'Keyword', exact: true })
      .fill(request.requestNo);
    await admin
      .getByRole('button', { name: 'Search Drafts', exact: true })
      .click();
    const row = admin.getByRole('row').filter({ hasText: request.requestNo });
    await row.getByRole('link', { name: 'Inspect', exact: true }).click();
    await expect(
      admin.getByRole('heading', { name: /Requester Information/ }),
    ).toBeVisible();
    await expect(
      admin.getByRole('button', { name: /Submit Draft|Edit information/ }),
    ).toHaveCount(0);
    await admin
      .getByRole('button', { name: 'Delete Draft', exact: true })
      .click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog).toContainText(request.requestNo);
    await admin.screenshot({
      path: join(
        system.evidence,
        'draft-delete-confirmation-desktop-light.png',
      ),
    });
    await dialog
      .getByRole('button', { name: 'Delete Draft permanently', exact: true })
      .click();
    await expect(admin).toHaveURL(`${system.origin}/admin/drafts`);
    assert.equal(
      (
        await creator.request.get(`${system.origin}/api/requests/${request.id}`)
      ).status(),
      404,
    );
    assert.equal(
      (await api(admin, 'GET', `/admin/drafts?keyword=${request.requestNo}`))
        .total,
      0,
    );
    const exportAfter = await creator.request.get(
      `${system.origin}/api/requests/export-jobs/${job.id}/download`,
    );
    assert.notEqual(exportAfter.status(), 200);
    assert.ok(
      (await api(admin, 'GET', '/admin/draft-deletions')).items.some(
        (item) => item.draftNo === request.requestNo,
      ),
    );
    assert.ok(
      !JSON.stringify(await api(other, 'GET', '/audit-logs')).includes(
        'Private draft payload deletion check',
      ),
    );
    assert.equal(
      (
        await other.request.get(`${system.origin}/api/admin/draft-deletions`)
      ).status(),
      403,
    );
    const own = await draft(creator, 'Creator delete from My Drafts');
    await creator.goto(`${system.origin}/my-drafts`);
    const ownRow = creator.getByRole('row').filter({ hasText: own.requestNo });
    await ownRow.getByRole('button', { name: /Delete/ }).click();
    await creator
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete Draft permanently', exact: true })
      .click();
    await expect(ownRow).toHaveCount(0);
  },
);

test(
  'seven-day reminder is one logical message with current recipients and observable missing-address reporting',
  { timeout: 90_000 },
  async (t) => {
    const { admin, creator } = await sessions(t);
    const request = await draft(creator, 'Reminder public boundary check');
    await system.database.query(
      "UPDATE psf_requests SET created_at=NOW()-INTERVAL '167 hours' WHERE id=$1",
      [request.id],
    );
    await reminderScanner().scan();
    let jobs = await api(admin, 'GET', '/admin/notifications?limit=100');
    assert.equal(
      jobs.items.filter(
        (item) =>
          item.eventType === 'DRAFT_REMINDER' && item.requestId === request.id,
      ).length,
      0,
    );
    await system.database.query(
      "UPDATE psf_requests SET created_at=NOW()-INTERVAL '168 hours' WHERE id=$1",
      [request.id],
    );
    await Promise.all([reminderScanner().scan(), reminderScanner().scan()]);
    await reminderScanner().scan();
    jobs = await api(admin, 'GET', '/admin/notifications?limit=100');
    const messages = jobs.items.filter(
      (item) =>
        item.eventType === 'DRAFT_REMINDER' && item.requestId === request.id,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, 'creator@nxp.com');
    assert.deepEqual(
      messages[0].cc.split(',').sort(),
      ['admin@nxp.com', 'second-admin@nxp.com'].sort(),
    );
    await expect
      .poll(
        () =>
          system.mail.filter((item) =>
            item.i_strBody.includes(request.requestNo),
          ).length,
      )
      .toBe(1);
    const missing = await draft(creator, 'Reminder missing address');
    const creatorId = (await api(creator, 'GET', '/me')).user.id;
    await system.database.query('UPDATE app_users SET email=NULL WHERE id=$1', [
      creatorId,
    ]);
    await system.database.query(
      "UPDATE psf_requests SET created_at=NOW()-INTERVAL '8 days' WHERE id=$1",
      [missing.id],
    );
    await reminderScanner().scan();
    const issue = (
      await api(admin, 'GET', '/admin/draft-reminders')
    ).items.find((item) => item.requestId === missing.id);
    assert.ok(
      issue.skippedRecipients.some((item) => item.userId === creatorId),
    );
    await admin.goto(`${system.origin}/admin/drafts`);
    await expect(
      admin.getByRole('row').filter({ hasText: missing.requestNo }),
    ).toContainText('Missing email address');
    const current = await api(creator, 'GET', `/requests/${request.id}`);
    await api(creator, 'DELETE', `/requests/${request.id}`, {
      expectedUpdatedAt: current.updatedAt,
    });
    assert.equal(
      (await api(admin, 'GET', '/admin/notifications?limit=100')).items.some(
        (item) => item.requestId === request.id,
      ),
      false,
    );
    assert.equal(
      (await api(admin, 'GET', '/admin/draft-reminders')).items.some(
        (item) => item.requestId === request.id,
      ),
      false,
    );
  },
);

test(
  'Product Type filters cross-team work without restricting PSF edits, and Submit/Delete have one winner',
  { timeout: 90_000 },
  async (t) => {
    const { admin, creator, gntc, mfg } = await sessions(t);
    const created = await draft(creator, 'GNTC Product Type routing');
    const submitted = await submit(creator, created);
    assert.equal(Object.hasOwn(submitted, 'setupOwnerUserId'), false);
    const list = await api(gntc, 'GET', '/requests?scope=related&team=GNTC');
    assert.ok(list.items.some((item) => item.requestId === submitted.id));
    const foreignTeam = await api(mfg, 'GET', `/requests/${submitted.id}`);
    assert.equal(foreignTeam.canEditPsfCreatedData, true);
    const psfSchema = await api(
      mfg,
      'GET',
      '/forms/psf-created-information/schema',
    );
    const values = {};
    for (const field of psfSchema.schema.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.required))
      values[field.fieldKey] =
        field.type === 'date'
          ? '2030-01-01'
          : (field.options?.[0] ?? 'PSF cross-team verification');
    const saved = await api(
      mfg,
      'PUT',
      `/requests/${submitted.id}/psf-created-data`,
      { expectedUpdatedAt: foreignTeam.updatedAt, psfCreatedData: values },
    );
    const regrouped = await api(
      creator,
      'PUT',
      `/requests/${submitted.id}/requester-data`,
      {
        formVersion: saved.formVersion,
        expectedUpdatedAt: saved.updatedAt,
        requesterData: {
          ...saved.requesterData,
          product_type: 'Transfer Product',
        },
      },
    );
    assert.deepEqual(regrouped.psfCreatedData, saved.psfCreatedData);
    assert.ok(
      !(await api(gntc, 'GET', '/requests?scope=related&team=GNTC')).items.some(
        (item) => item.requestId === submitted.id,
      ),
    );
    assert.ok(
      (await api(mfg, 'GET', '/requests?scope=related&team=MFG')).items.some(
        (item) => item.requestId === submitted.id,
      ),
    );
    assert.equal(
      (
        await admin.request.delete(
          `${system.origin}/api/requests/${submitted.id}`,
          { data: { expectedUpdatedAt: regrouped.updatedAt } },
        )
      ).status(),
      409,
    );
    const race = await draft(creator, 'Submit/Delete race');
    const work = (await api(creator, 'GET', '/workflow/statuses')).entries.find(
      (item) => item.kind === 'open',
    ).name;
    const gate = await system.database.connect();
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM psf_requests WHERE id=$1 FOR UPDATE', [
      race.id,
    ]);
    const operations = [
      creator.request.post(`${system.origin}/api/requests/${race.id}/submit`, {
        data: {
          status: work,
          formVersion: race.formVersion,
          expectedUpdatedAt: race.updatedAt,
        },
      }),
      admin.request.delete(`${system.origin}/api/requests/${race.id}`, {
        data: { expectedUpdatedAt: race.updatedAt },
      }),
    ];
    try {
      await expect
        .poll(async () =>
          Number(
            (
              await system.database.query(
                "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
              )
            ).rows[0].n,
          ),
        )
        .toBeGreaterThanOrEqual(2);
    } finally {
      await gate.query('COMMIT');
      gate.release();
    }
    const responses = await Promise.all(operations);
    assert.equal(responses.filter((response) => response.ok()).length, 1);
    assert.ok(
      responses
        .filter((response) => !response.ok())
        .every((response) => [404, 409].includes(response.status())),
    );
    for (const [name, viewport] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      await gntc.setViewportSize(viewport);
      for (const mode of ['light', 'dark']) {
        await gntc.goto(`${system.origin}/dashboard`);
        await gntc.evaluate(
          (dark) => document.documentElement.classList.toggle('dark', dark),
          mode === 'dark',
        );
        await expect(
          gntc.getByRole('combobox', { name: 'Team', exact: true }),
        ).toHaveValue('GNTC');
        await gntc.screenshot({
          path: join(system.evidence, `team-dashboard-${name}-${mode}.png`),
        });
        await admin.setViewportSize(viewport);
        await admin.goto(`${system.origin}/admin/drafts`);
        await admin.evaluate(
          (dark) => document.documentElement.classList.toggle('dark', dark),
          mode === 'dark',
        );
        await expect(
          admin.getByRole('heading', { name: 'Draft Management', exact: true }),
        ).toBeVisible();
        await expect(admin.getByText('Loading deletion records…')).toHaveCount(
          0,
        );
        await expect(
          admin
            .getByRole('row')
            .filter({ hasText: 'Reminder missing address' }),
        ).toContainText('Missing email address');
        await admin.screenshot({
          path: join(system.evidence, `draft-management-${name}-${mode}.png`),
        });
        if (name === 'mobile') {
          const rowDelete = admin
            .getByRole('row')
            .filter({ hasText: 'Reminder missing address' })
            .getByRole('button', { name: /^Delete / });
          await rowDelete.focus();
          await admin.keyboard.press('Enter');
          const confirmation = admin.getByRole('dialog');
          await expect(confirmation).toBeVisible();
          const bounds = await confirmation.boundingBox();
          assert.ok(
            bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1,
          );
          assert.ok(
            bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1,
          );
          await admin.screenshot({
            path: join(
              system.evidence,
              `draft-delete-confirmation-${name}-${mode}.png`,
            ),
          });
          await admin.keyboard.press('Escape');
          await expect(confirmation).not.toBeVisible();
          await expect(rowDelete).toBeFocused();
        }
      }
    }
  },
);

test(
  'public lifecycle actions fence reminder delivery through independent sessions and a real mail receiver',
  { timeout: 90_000 },
  async (t) => {
    const { admin, creator } = await sessions(t);
    const openStatus = (
      await api(creator, 'GET', '/workflow/statuses')
    ).entries.find((entry) => entry.kind === 'open').name;
    for (const action of ['submit', 'delete']) {
      const request = await draft(
        creator,
        `Public ${action} wins before reminder`,
      );
      const gate = await system.database.connect();
      await gate.query('BEGIN');
      await gate.query(
        "UPDATE psf_requests SET created_at=NOW()-INTERVAL '8 days' WHERE id=$1",
        [request.id],
      );
      const response =
        action === 'submit'
          ? creator.request.post(
              `${system.origin}/api/requests/${request.id}/submit`,
              {
                data: {
                  status: openStatus,
                  formVersion: request.formVersion,
                  expectedUpdatedAt: request.updatedAt,
                },
              },
            )
          : admin.request.delete(
              `${system.origin}/api/requests/${request.id}`,
              { data: { expectedUpdatedAt: request.updatedAt } },
            );
      try {
        await expect
          .poll(async () =>
            Number(
              (
                await system.database.query(
                  "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
                )
              ).rows[0].n,
            ),
          )
          .toBeGreaterThanOrEqual(1);
      } finally {
        await gate.query('COMMIT');
        gate.release();
      }
      assert.ok((await response).ok());
      await Promise.all([reminderScanner().scan(), reminderScanner().scan()]);
      assert.equal(
        (await api(admin, 'GET', '/admin/notifications?limit=100')).items.some(
          (job) =>
            job.eventType === 'DRAFT_REMINDER' && job.requestId === request.id,
        ),
        false,
      );
      assert.equal(
        system.mail.some((mail) => mail.i_strBody.includes(request.requestNo)),
        false,
      );
    }
    const request = await draft(
      creator,
      'External delivery wins before public deletion',
    );
    const mailGate = system.pauseMail(request.requestNo);
    await system.database.query(
      "UPDATE psf_requests SET created_at=NOW()-INTERVAL '8 days' WHERE id=$1",
      [request.id],
    );
    await reminderScanner().scan();
    const entered = await mailGate.entered;
    assert.ok(entered.i_strBody.includes(request.requestNo));
    const response = admin.request.delete(
      `${system.origin}/api/requests/${request.id}`,
      { data: { expectedUpdatedAt: request.updatedAt } },
    );
    try {
      await expect
        .poll(async () =>
          Number(
            (
              await system.database.query(
                "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
              )
            ).rows[0].n,
          ),
        )
        .toBeGreaterThanOrEqual(1);
    } finally {
      mailGate.release();
    }
    assert.equal((await response).status(), 200);
    assert.equal(
      system.mail.filter((mail) => mail.i_strBody.includes(request.requestNo))
        .length,
      1,
    );
    assert.equal(
      (await api(admin, 'GET', '/admin/notifications?limit=100')).items.some(
        (job) => job.requestId === request.id,
      ),
      false,
    );
    assert.equal(
      (
        await creator.request.get(`${system.origin}/api/requests/${request.id}`)
      ).status(),
      404,
    );
  },
);
