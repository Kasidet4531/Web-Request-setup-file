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
      name: `Edit email policy for ${status.name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole('checkbox', { name: 'Do not send email on entry' })
    .uncheck();
  await page
    .getByRole('textbox', { name: 'To addresses', exact: true })
    .fill('GROUP@nxp.com; group@nxp.com');
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
  if (!enabled)
    await page
      .getByRole('checkbox', { name: 'Do not send email on entry' })
      .check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/workflow') &&
      response.request().method() === 'PUT',
  );
  await page
    .getByRole('button', { name: 'Save email policy', exact: true })
    .click();
  assert.equal((await saved).status(), 200);
  await expect(
    page.getByRole('button', {
      name: `Edit email policy for ${status.name}`,
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
