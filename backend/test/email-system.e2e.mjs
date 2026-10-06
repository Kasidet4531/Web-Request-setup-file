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

async function createStatus(page, name) {
  const config = await api(page, 'GET', '/admin/workflow');
  const next = await api(page, 'PUT', '/admin/workflow', {
    action: 'create',
    name,
    kind: 'open',
    expectedUpdatedAt: config.updatedAt,
  });
  return next.entries.find((entry) => entry.name === name);
}

async function setPolicy(page, status, enabled) {
  await page.goto(`${system.origin}/admin/workflow`);
  await expect(
    page.getByRole('heading', { name: 'Status Management', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: `Edit ${status.name}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Edit status', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Do not send email on entry' })
    .uncheck();
  await page
    .getByRole('textbox', { name: 'To addresses', exact: true })
    .fill('GROUP@nxp.com; group@nxp.com');
  await page.getByRole('button', { name: 'Add To', exact: true }).click();
  await expect(
    page
      .getByRole('combobox', { name: 'Add system user to To' })
      .locator('option[value="admin@nxp.com"]'),
  ).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Add system user to To' })
    .selectOption('admin@nxp.com');
  await page
    .getByRole('textbox', { name: 'CC addresses', exact: true })
    .fill('group@nxp.com, copy@nxp.com');
  await page.getByRole('button', { name: 'Add CC', exact: true }).click();
  if (!enabled)
    await page
      .getByRole('checkbox', { name: 'Do not send email on entry' })
      .check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/workflow') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await expect(
    page.getByRole('button', {
      name: `Edit ${status.name}`,
      exact: true,
    }),
  ).toBeEnabled();
  const config = await api(page, 'GET', '/admin/workflow');
  assert.deepEqual(
    config.entries.find((entry) => entry.id === status.id).emailPolicy,
    { enabled, to: ['group@nxp.com', 'admin@nxp.com'], cc: ['copy@nxp.com'] },
  );
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

async function seedSubmitted(page, title, source) {
  const request = await draft(page, title);
  return api(page, 'POST', `/requests/${request.id}/submit`, {
    formVersion: request.formVersion,
    expectedUpdatedAt: request.updatedAt,
    status: source.name,
  });
}

async function applyStatus(page, request, target, submission = false) {
  await page.goto(`${system.origin}/requests/${request.id}`);
  await expect(
    page.getByRole('heading', {
      name: request.requesterData.title,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('complementary', { name: 'Request actions' })
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption(target.name);
  const response = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(
          `/api/requests/${request.id}/${submission ? 'submit' : 'status'}`,
        ) && response.request().method() === (submission ? 'POST' : 'PUT'),
  );
  await page
    .getByRole('button', {
      name: submission ? 'Submit request' : 'Save Status',
      exact: true,
    })
    .click();
  assert.equal((await response).status(), submission ? 201 : 200);
  await expect(
    page
      .getByRole('region', { name: 'Request header' })
      .getByRole('button', { name: target.name, exact: true }),
  ).toBeVisible();
  const stored = await system.database.query(
    'SELECT status FROM psf_requests WHERE id=$1',
    [request.id],
  );
  assert.equal(stored.rows[0].status, target.name);
}

async function jobs(requestId) {
  return (
    await system.database.query(
      'SELECT * FROM email_outbox WHERE request_id=$1 ORDER BY created_at',
      [requestId],
    )
  ).rows;
}

async function assertDelivered(request, target, event) {
  await expect
    .poll(async () => (await jobs(request.id)).map((job) => job.status), {
      timeout: 15_000,
      message: 'One queued job is delivered by the real worker',
    })
    .toEqual(['sent']);
  const [job] = await jobs(request.id);
  assert.equal(job.event_type, event);
  assert.equal(job.target_status_name, target.name);
  assert.equal(job.from_address, 'noreply-psf@nxp.com');
  assert.equal(job.to_recipients, 'group@nxp.com,admin@nxp.com');
  assert.equal(job.cc_recipients, 'copy@nxp.com');
  assert.equal(job.sent_to, 'To: capture@nxp.com; CC: ; BCC: ');
  assert.ok(job.body_html.includes(request.requesterData.title));
  const sent = system.mail.filter(
    (mail) =>
      mail.accepted && mail.i_strBody.includes(`/requests/${request.id}`),
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].i_strFrom, 'noreply-psf@nxp.com');
  assert.equal(sent[0].i_strTo, 'capture@nxp.com');
  assert.equal(sent[0].i_strCC, '');
  assert.equal(sent[0].i_strBCC, '');
  assert.ok(sent[0].i_strSubject.startsWith('[TEST] '));
  assert.ok(
    sent[0].i_strBody.includes(
      'To: group@nxp.com,admin@nxp.com; CC: copy@nxp.com',
    ),
  );
  assert.ok(sent[0].i_strBody.includes(target.name));
}

// Break caught: selecting the source policy or dropping the transition hook.
test(
  'destination policy flows from browser through database to SOAP delivery',
  { timeout: 45_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const source = await createStatus(page, 'E2E source A');
    const target = await createStatus(page, 'E2E destination B');
    await setPolicy(page, target, true);
    const request = await seedSubmitted(page, 'Destination policy E2E', source);
    assert.deepEqual(await jobs(request.id), []);
    await applyStatus(page, request, target);
    await assertDelivered(request, target, 'REQUEST_STATUS_CHANGED');
    await page.screenshot({
      path: join(system.evidence, 'destination-delivered.png'),
      fullPage: true,
    });
  },
);

// Break caught: enqueueing even when the destination checkbox disables email.
test(
  'disabled destination retains recipients but changes status without email',
  { timeout: 45_000 },
  async (t) => {
    const page = await loginPage(system, t);
    await page.setViewportSize({ width: 390, height: 844 });
    const source = await createStatus(page, 'E2E disabled source');
    const target = await createStatus(page, 'E2E disabled destination');
    await setPolicy(page, target, false);
    const request = await seedSubmitted(page, 'Disabled policy E2E', source);
    await applyStatus(page, request, target);
    assert.deepEqual(await jobs(request.id), []);
    assert.equal(
      system.mail.filter((mail) => mail.i_strBody.includes(request.id)).length,
      0,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      'Mobile page stays within the viewport',
    );
    await page.screenshot({
      path: join(system.evidence, 'disabled-mobile.png'),
      fullPage: true,
    });
  },
);

// Break caught: swallowing HTTP-200 SOAP faults, losing retries, or aborting status.
test(
  'SOAP failure preserves business status and a later worker poll retries successfully',
  { timeout: 45_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const source = await createStatus(page, 'E2E retry source');
    const target = await createStatus(page, 'E2E retry destination');
    await setPolicy(page, target, true);
    const request = await seedSubmitted(page, 'Retry policy E2E', source);
    system.failOnce.add(request.id);
    await applyStatus(page, request, target);
    await expect
      .poll(
        async () =>
          (await jobs(request.id)).map(({ status, attempts }) => ({
            status,
            attempts,
          })),
        { timeout: 15_000 },
      )
      .toEqual([{ status: 'pending', attempts: 1 }]);
    const [failed] = await jobs(request.id);
    assert.match(failed.last_error, /Offline relay unavailable/);
    const delay = await system.database.query(
      'SELECT EXTRACT(EPOCH FROM next_attempt_at-NOW())::float AS seconds FROM email_outbox WHERE id=$1',
      [failed.id],
    );
    assert.ok(
      delay.rows[0].seconds > 45 && delay.rows[0].seconds <= 60,
      'First retry is due within one minute, allowing time to observe failure',
    );
    assert.equal(
      (await api(page, 'GET', `/requests/${request.id}`)).status,
      target.name,
    );
    // Advance only this job's eligibility; leave the production worker and retry logic intact.
    await system.database.query(
      'UPDATE email_outbox SET next_attempt_at=NOW() WHERE id=$1',
      [failed.id],
    );
    await assertDelivered(request, target, 'REQUEST_STATUS_CHANGED');
    assert.equal((await jobs(request.id))[0].attempts, 2);
    assert.equal(
      system.mail.filter((mail) => mail.i_strBody.includes(request.id)).length,
      2,
    );
  },
);

// Break caught: bulk replacement omits jobs or uses the deleted source policy.
test(
  'bulk replacement commits every request and delivers one destination email per request',
  { timeout: 45_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const source = await createStatus(page, 'E2E bulk source');
    const target = await createStatus(page, 'E2E bulk destination');
    await setPolicy(page, target, true);
    const requests = [
      await seedSubmitted(page, 'Bulk first E2E', source),
      await seedSubmitted(page, 'Bulk second E2E', source),
    ];
    await page.goto(`${system.origin}/admin/workflow`);
    await page
      .getByRole('row')
      .filter({ has: page.getByText(source.name, { exact: true }) })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', {
        name: 'Replace and delete status',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Replacement status', exact: true })
      .selectOption(target.id);
    await expect(
      page.getByText(
        'One email will be queued for each of the 2 affected requests.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.screenshot({
      path: join(system.evidence, 'bulk-preview.png'),
      fullPage: true,
    });
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/workflow') &&
        response.request().method() === 'PUT',
    );
    await page
      .getByRole('button', { name: 'Replace and delete', exact: true })
      .click();
    assert.equal((await response).status(), 200);
    await expect(
      page
        .getByRole('row')
        .filter({ has: page.getByText(source.name, { exact: true }) }),
    ).toHaveCount(0);
    for (const request of requests) {
      assert.equal(
        (await api(page, 'GET', `/requests/${request.id}`)).status,
        target.name,
      );
      await assertDelivered(request, target, 'REQUEST_STATUS_CHANGED');
    }
  },
);

// Break caught: submission emits no notification or both submitted/status events.
test(
  'browser draft submission sends exactly one destination-policy notification',
  { timeout: 45_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const target = await createStatus(page, 'E2E submission destination');
    await setPolicy(page, target, true);
    const request = await draft(page, 'Submission policy E2E');
    assert.deepEqual(await jobs(request.id), []);
    await applyStatus(page, request, target, true);
    await assertDelivered(request, target, 'REQUEST_SUBMITTED');
  },
);

// Break caught: split name/policy writes, discarded recipient chips, or dialogs
// that move the page, lose focus, overflow mobile, or hide their action footer.
test(
  'combined status editor preserves recipients and rolls back name and policy together',
  { timeout: 60_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const source = await createStatus(page, 'E2E combined original');
    const replacement = await createStatus(page, 'E2E combined replacement');
    const request = await seedSubmitted(page, 'Combined edit request', source);
    await page.goto(`${system.origin}/admin/workflow`);
    const edit = page.getByRole('button', {
      name: `Edit ${source.name}`,
      exact: true,
    });
    await edit.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    await edit.click();
    const editor = page.getByRole('dialog', {
      name: 'Edit status',
      exact: true,
    });
    await expect(editor).toBeVisible();
    await expect(
      editor.getByRole('textbox', { name: 'Status name', exact: true }),
    ).toBeFocused();
    assert.equal(await page.evaluate(() => window.scrollY), scroll);
    await editor
      .getByRole('textbox', { name: 'Status name', exact: true })
      .fill('Unsaved name');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(edit).toBeFocused();
    assert.equal(
      (await api(page, 'GET', '/admin/workflow')).entries.find(
        (entry) => entry.id === source.id,
      ).name,
      source.name,
    );

    await edit.click();
    await editor
      .getByRole('textbox', { name: 'Status name', exact: true })
      .fill('E2E combined renamed');
    await editor
      .getByRole('checkbox', { name: 'Do not send email on entry' })
      .uncheck();
    const to = editor.getByRole('textbox', {
      name: 'To addresses',
      exact: true,
    });
    await to.fill('GROUP@nxp.com');
    await to.press('Enter');
    await expect(to).toHaveValue('');
    await to.fill('temporary@nxp.com');
    await editor.getByRole('button', { name: 'Add To', exact: true }).click();
    await editor
      .getByRole('button', {
        name: 'Remove temporary@nxp.com from To',
        exact: true,
      })
      .click();
    await editor
      .getByRole('combobox', { name: 'Add system user to To' })
      .selectOption('admin@nxp.com');
    await to.fill('group@nxp.com');
    await editor.getByRole('button', { name: 'Add To', exact: true }).click();
    await expect(
      editor.getByRole('list', { name: 'To recipients' }).locator('li'),
    ).toHaveCount(2);
    const copy = 'long.group.address.for.status.management.review@nxp.com';
    await editor
      .getByRole('textbox', { name: 'CC addresses', exact: true })
      .fill(copy);
    await editor.getByRole('button', { name: 'Add CC', exact: true }).click();
    const save = editor.getByRole('button', {
      name: 'Save changes',
      exact: true,
    });
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await editor.boundingBox();
      assert.ok(
        bounds.x >= 0 && bounds.x + bounds.width <= width,
        `Dialog fits ${width}px`,
      );
      const footer = await save.boundingBox();
      assert.ok(
        footer.y >= 0 && footer.y + footer.height <= 900,
        'Save stays in the viewport',
      );
      assert.ok(
        await save.evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return hit === button || button.contains(hit);
        }),
        'Save is not clipped or covered by dialog content',
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      if (width === 320 || width === 1440)
        await page.screenshot({
          path: join(system.evidence, `status-editor-${width}.png`),
          fullPage: false,
        });
    }

    const policy = {
      enabled: true,
      to: ['group@nxp.com', 'admin@nxp.com'],
      cc: [copy],
    };
    const focusableCount = await editor
      .locator(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      )
      .count();
    for (let index = 0; index <= focusableCount; index += 1) {
      await page.keyboard.press('Tab');
      const focus = await editor.evaluate((dialog) => ({
        modal: dialog.matches(':modal'),
        inside: dialog.contains(document.activeElement),
        browserChrome:
          !document.hasFocus() && document.activeElement === document.body,
      }));
      // Native dialogs permit focus to visit browser chrome. Page controls
      // outside the modal must remain unavailable while the document is focused.
      assert.ok(
        focus.modal && (focus.inside || focus.browserChrome),
        'Tab never focuses background page controls',
      );
    }
    const current = await api(page, 'GET', '/admin/workflow');
    await system.database.query(
      `CREATE FUNCTION fail_combined_edit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'offline combined edit failure'; END; $$ LANGUAGE plpgsql`,
    );
    await system.database.query(
      'CREATE TRIGGER fail_combined_edit BEFORE UPDATE ON workflow_transition_config FOR EACH ROW EXECUTE FUNCTION fail_combined_edit()',
    );
    try {
      // Send the deliberate failure from Node to keep expected HTTP-500 console
      // noise out of browser health checks. It exercises the same authenticated API.
      const cookies = await page.context().cookies(system.origin);
      const failed = await fetch(`${system.origin}/api/admin/workflow`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookies
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join('; '),
        },
        body: JSON.stringify({
          action: 'rename',
          id: source.id,
          name: 'E2E combined renamed',
          emailPolicy: policy,
          psfAccessTrigger: false,
          expectedUpdatedAt: current.updatedAt,
        }),
      });
      assert.equal(failed.status, 500);
      const unchanged = (
        await api(page, 'GET', '/admin/workflow')
      ).entries.find((entry) => entry.id === source.id);
      assert.equal(unchanged.name, source.name);
      assert.deepEqual(unchanged.emailPolicy, {
        enabled: false,
        to: [],
        cc: [],
      });
      assert.equal(
        (
          await system.database.query(
            'SELECT status FROM psf_requests WHERE id=$1',
            [request.id],
          )
        ).rows[0].status,
        source.name,
      );
      assert.equal(
        (
          await system.database.query(
            'SELECT status FROM psf_request_search_index WHERE request_id=$1',
            [request.id],
          )
        ).rows[0].status,
        source.name,
      );
    } finally {
      await system.database.query(
        'DROP TRIGGER fail_combined_edit ON workflow_transition_config',
      );
      await system.database.query('DROP FUNCTION fail_combined_edit()');
    }
    const writes = [];
    page.on('request', (request) => {
      if (
        request.url().endsWith('/api/admin/workflow') &&
        request.method() === 'PUT'
      )
        writes.push(request.postDataJSON());
    });
    await save.click();
    await expect(editor).toHaveCount(0);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      action: 'rename',
      id: source.id,
      name: 'E2E combined renamed',
      emailPolicy: policy,
      psfAccessTrigger: false,
      expectedUpdatedAt: current.updatedAt,
    });
    const stored = (await api(page, 'GET', '/admin/workflow')).entries.find(
      (entry) => entry.id === source.id,
    );
    assert.equal(stored.name, 'E2E combined renamed');
    assert.deepEqual(stored.emailPolicy, policy);
    assert.equal(
      (
        await system.database.query(
          'SELECT status FROM psf_requests WHERE id=$1',
          [request.id],
        )
      ).rows[0].status,
      stored.name,
    );
    assert.deepEqual(
      await jobs(request.id),
      [],
      'Catalog editing does not send request notifications',
    );
    await expect(
      page.getByRole('button', { name: `Edit ${stored.name}`, exact: true }),
    ).toBeFocused();
    await page
      .getByRole('row')
      .filter({ has: page.getByText(stored.name, { exact: true }) })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    const deletion = page.getByRole('dialog', {
      name: 'Replace and delete status',
      exact: true,
    });
    await expect(deletion).toBeVisible();
    await expect(
      deletion.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await deletion
      .getByRole('combobox', { name: 'Replacement status', exact: true })
      .selectOption(replacement.id);
    await expect(
      deletion.getByText(
        'Email is disabled for this destination. No notification emails will be queued.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.screenshot({
      path: join(system.evidence, 'replacement-dialog.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await expect(deletion).toHaveCount(0);
    await expect(
      page
        .getByRole('row')
        .filter({ has: page.getByText(stored.name, { exact: true }) })
        .getByRole('button', { name: 'Delete', exact: true }),
    ).toBeFocused();
  },
);
