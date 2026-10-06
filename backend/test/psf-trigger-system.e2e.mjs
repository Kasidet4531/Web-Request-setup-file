import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { join } from 'node:path';
import { expect } from 'playwright/test';
import { startEmailSystem, loginPage, api } from './email-system.fixture.mjs';

let system;
before(
  async () => {
    system = await startEmailSystem();
  },
  { timeout: 60_000 },
);
after(async () => {
  if (system) await system.close();
});
const triggerLabel = 'Allow requesters to view PSF Created Information';
const requiredSchema = {
  formKey: 'psf-created-information',
  version: 1,
  title: 'PSF',
  sections: [
    {
      sectionKey: 'psf',
      title: 'PSF',
      fields: [
        {
          fieldKey: 'setup',
          canonicalKey: 'setup',
          label: 'Setup',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};

async function createStatus(page, name) {
  const current = await api(page, 'GET', '/admin/workflow');
  const config = await api(page, 'PUT', '/admin/workflow', {
    action: 'create',
    name,
    kind: 'open',
    expectedUpdatedAt: current.updatedAt,
  });
  return config.entries.find((entry) => entry.name === name);
}
async function draft(page, title) {
  return api(page, 'POST', '/requests', {
    requesterData: {
      product_type: 'New Product',
      title,
      requester_name: 'Email E2E Admin',
      due_date: '2030-01-15',
      priority: 'High',
      product: 'E2E Product',
      wafer_fab: 'E2E FAB',
      probecard_name: 'E2E Card',
    },
  });
}
async function submit(page, request, status) {
  return api(page, 'POST', `/requests/${request.id}/submit`, {
    formVersion: request.formVersion,
    expectedUpdatedAt: request.updatedAt,
    status: status.name,
  });
}
async function row(id) {
  return (
    await system.database.query(
      'SELECT status, psf_released_at, updated_at FROM psf_requests WHERE id=$1',
      [id],
    )
  ).rows[0];
}
async function edit(page, status) {
  await page.goto(`${system.origin}/admin/workflow`);
  await page
    .getByRole('button', { name: `Edit ${status.name}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Edit status', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function save(page, dialog, expectedStatus = 200) {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/workflow') &&
      response.request().method() === 'PUT',
  );
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  const saved = await response;
  assert.equal(saved.status(), expectedStatus);
  if (expectedStatus === 200) await expect(dialog).toHaveCount(0);
  return saved.json();
}

test(
  'legacy single trigger survives reads and migrates without an implicit release',
  { timeout: 30_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const legacy = await createStatus(page, 'Legacy PSF trigger');
    const request = await submit(
      page,
      await draft(page, 'Legacy unreleased request'),
      legacy,
    );
    await system.database.query(
      `UPDATE workflow_transition_config SET config_json=(config_json - 'psfVisibilityTriggerIds') || jsonb_build_object('psfVisibilityTriggerId', $1::text), updated_at=clock_timestamp()`,
      [legacy.id],
    );
    const current = await api(page, 'GET', '/admin/workflow');
    assert.deepEqual(current.psfVisibilityTriggerIds, [legacy.id]);
    assert.equal(
      current.entries.find((entry) => entry.id === legacy.id).psfAccessTrigger,
      true,
    );
    assert.equal((await row(request.id)).psf_released_at, null);
    const dialog = await edit(page, legacy);
    await expect(
      dialog.getByRole('checkbox', { name: triggerLabel, exact: true }),
    ).toBeChecked();
    await dialog
      .getByRole('checkbox', { name: triggerLabel, exact: true })
      .uncheck();
    await save(page, dialog);
    assert.deepEqual(
      (await api(page, 'GET', '/admin/workflow')).psfVisibilityTriggerIds,
      [],
    );
    assert.equal((await row(request.id)).psf_released_at, null);
  },
);

test(
  'multi-trigger modal releases existing and future requests atomically without duplicates or inheritance',
  { timeout: 60_000 },
  async (t) => {
    const page = await loginPage(system, t, [
      { path: '/admin/workflow', status: 400 },
    ]);
    const [a, b, c] = (
      await api(page, 'GET', '/admin/workflow')
    ).entries.filter((entry) => entry.kind === 'open');
    const good = await submit(
      page,
      await draft(page, 'Complete existing A'),
      a,
    );
    const bad = await submit(
      page,
      await draft(page, 'Incomplete existing A'),
      a,
    );
    const existingB = await submit(page, await draft(page, 'Existing B'), b);
    const existingC = await submit(page, await draft(page, 'Existing C'), c);
    await system.database.query(
      'UPDATE psf_requests SET psf_created_schema_snapshot_json=$1::jsonb, psf_created_data_json=$2::jsonb WHERE id=$3',
      [requiredSchema, { setup: 'Complete' }, good.id],
    );
    await system.database.query(
      'UPDATE psf_requests SET psf_created_schema_snapshot_json=$1::jsonb, psf_created_data_json=$2::jsonb WHERE id=$3',
      [requiredSchema, {}, bad.id],
    );
    const before = await api(page, 'GET', '/admin/workflow');
    const originalSearch = (
      await system.database.query(
        'SELECT status, updated_at FROM psf_request_search_index WHERE request_id=$1',
        [good.id],
      )
    ).rows[0];
    let dialog = await edit(page, a);
    await dialog
      .getByRole('textbox', { name: 'Status name', exact: true })
      .fill('PSF trigger A renamed');
    await dialog
      .getByRole('checkbox', { name: 'Do not send email on entry' })
      .uncheck();
    await dialog
      .getByRole('textbox', { name: 'To addresses', exact: true })
      .fill('group@nxp.com');
    await dialog.getByRole('button', { name: 'Add To', exact: true }).click();
    await dialog
      .getByRole('checkbox', { name: triggerLabel, exact: true })
      .check();
    const failed = await save(page, dialog, 400);
    assert.ok(failed.message.includes(bad.requestNo));
    await expect(dialog.getByRole('alert')).toContainText(bad.requestNo);
    await expect(
      dialog.getByRole('checkbox', { name: triggerLabel, exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: join(system.evidence, 'psf-trigger-edit-validation.png'),
      fullPage: false,
    });
    assert.equal(
      (await api(page, 'GET', '/admin/workflow')).updatedAt,
      before.updatedAt,
    );
    assert.equal((await row(good.id)).psf_released_at, null);
    assert.equal((await row(bad.id)).psf_released_at, null);
    assert.equal((await row(good.id)).status, a.name);
    assert.deepEqual(
      (
        await system.database.query(
          'SELECT status, updated_at FROM psf_request_search_index WHERE request_id=$1',
          [good.id],
        )
      ).rows[0],
      originalSearch,
    );
    assert.deepEqual(
      (await api(page, 'GET', '/admin/workflow')).entries.find(
        (entry) => entry.id === a.id,
      ).emailPolicy,
      { enabled: false, to: [], cc: [] },
    );

    await system.database.query(
      'UPDATE psf_requests SET psf_created_data_json=$1::jsonb WHERE id=$2',
      [{ setup: 'Now complete' }, bad.id],
    );
    await save(page, dialog);
    a.name = 'PSF trigger A renamed';
    assert.ok((await row(good.id)).psf_released_at);
    assert.ok((await row(bad.id)).psf_released_at);
    assert.equal((await row(good.id)).status, a.name);
    assert.equal((await row(existingB.id)).psf_released_at, null);
    const aRelease = (await row(good.id)).psf_released_at.toISOString();
    dialog = await edit(page, b);
    await dialog
      .getByRole('checkbox', { name: triggerLabel, exact: true })
      .check();
    await save(page, dialog);
    const multi = await api(page, 'GET', '/admin/workflow');
    assert.deepEqual(multi.psfVisibilityTriggerIds, [a.id, b.id]);
    assert.equal(multi.psfVisibilityTriggerId, null);
    assert.ok((await row(existingB.id)).psf_released_at);
    await expect(
      page.getByRole('columnheader', {
        name: 'PSF access trigger',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('row')
        .filter({ has: page.getByText(a.name, { exact: true }) })
        .getByText('Trigger', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('row')
        .filter({ has: page.getByText(b.name, { exact: true }) })
        .getByText('Trigger', { exact: true }),
    ).toBeVisible();
    assert.equal(
      (
        await system.database.query(
          'SELECT COUNT(*)::int AS count FROM email_outbox',
        )
      ).rows[0].count,
      0,
      'Configuration release never sends mail',
    );

    // Change only the test account's DB role to exercise the real requester view
    // through the same authenticated session; restore admin before further edits.
    const user = (await api(page, 'GET', '/me')).user;
    await system.database.query(
      "UPDATE app_users SET role='requester' WHERE id=$1",
      [user.id],
    );
    try {
      assert.equal(
        (await api(page, 'GET', `/requests/${good.id}`)).psfCreatedDataVisible,
        true,
      );
      const hidden = await api(page, 'GET', `/requests/${existingC.id}`);
      assert.equal(hidden.psfCreatedDataVisible, false);
      assert.deepEqual(hidden.psfCreatedData, {});
    } finally {
      await system.database.query(
        "UPDATE app_users SET role='admin' WHERE id=$1",
        [user.id],
      );
    }

    const moved = await api(page, 'GET', `/requests/${good.id}`);
    await api(page, 'PUT', `/requests/${good.id}/status`, {
      status: b.name,
      expectedUpdatedAt: moved.updatedAt,
    });
    assert.equal((await row(good.id)).psf_released_at.toISOString(), aRelease);
    const future = await submit(page, await draft(page, 'Future B entry'), b);
    assert.ok((await row(future.id)).psf_released_at);
    dialog = await edit(page, a);
    await dialog
      .getByRole('checkbox', { name: triggerLabel, exact: true })
      .uncheck();
    await dialog
      .getByRole('checkbox', { name: 'Do not send email on entry' })
      .check();
    await save(page, dialog);
    assert.deepEqual(
      (await api(page, 'GET', '/admin/workflow')).psfVisibilityTriggerIds,
      [b.id],
    );
    assert.equal((await row(bad.id)).psf_released_at.toISOString(), aRelease);
    const futureA = await submit(
      page,
      await draft(page, 'Future disabled A'),
      a,
    );
    assert.equal((await row(futureA.id)).psf_released_at, null);
    dialog = await edit(page, a);
    await dialog
      .getByRole('checkbox', { name: triggerLabel, exact: true })
      .check();
    await save(page, dialog);
    assert.equal((await row(good.id)).psf_released_at.toISOString(), aRelease);
    assert.ok((await row(futureA.id)).psf_released_at);
    await page.screenshot({
      path: join(system.evidence, 'psf-multiple-triggers.png'),
      fullPage: false,
    });

    await page
      .getByRole('row')
      .filter({ has: page.getByText(b.name, { exact: true }) })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    const deletion = page.getByRole('dialog', {
      name: 'Replace and delete status',
      exact: true,
    });
    await deletion
      .getByRole('combobox', { name: 'Replacement status', exact: true })
      .selectOption(c.id);
    await expect(
      deletion.getByRole('combobox', {
        name: 'Replace visibility trigger',
        exact: true,
      }),
    ).toHaveCount(0);
    const deleted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/workflow') &&
        response.request().method() === 'PUT',
    );
    await deletion
      .getByRole('button', { name: 'Replace and delete', exact: true })
      .click();
    assert.equal((await deleted).status(), 200);
    await expect(deletion).toHaveCount(0);
    const after = await api(page, 'GET', '/admin/workflow');
    assert.deepEqual(after.psfVisibilityTriggerIds, [a.id]);
    assert.equal(
      after.entries.find((entry) => entry.id === c.id).psfAccessTrigger,
      false,
    );
    assert.equal((await row(existingC.id)).psf_released_at, null);
    assert.equal((await row(good.id)).psf_released_at.toISOString(), aRelease);
  },
);
