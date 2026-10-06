import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect } from 'playwright/test';
import { startEmailSystem, loginPage, api } from './email-system.fixture.mjs';

const creatorCredentials = {
  username: 'assignment.creator',
  password: 'offline-only',
};
const firstCredentials = {
  username: 'assignment.owner.one',
  password: 'offline-only',
};
const secondCredentials = {
  username: 'assignment.owner.two',
  password: 'offline-only',
};
const users = [
  {
    ...creatorCredentials,
    profile: {
      name: 'Assignment Creator',
      email: 'creator@nxp.com',
      employeeId: 'offline-101',
      title: 'Engineer',
    },
  },
  {
    ...firstCredentials,
    profile: {
      name: 'Same Name Owner',
      email: 'one@nxp.com',
      employeeId: 'offline-102',
      title: 'Engineer',
    },
  },
  {
    ...secondCredentials,
    profile: {
      name: 'Same Name Owner',
      email: 'two@nxp.com',
      employeeId: 'offline-103',
      title: 'Engineer',
    },
  },
];
let system;
before(
  async () => {
    system = await startEmailSystem({ users });
  },
  { timeout: 60_000 },
);
after(async () => {
  if (system) await system.close();
});

// Break caught: opting into extra LDAP identities ignores credentials or replaces the fixture's default admin.
test(
  'opt-in LDAP identities preserve default admin and establish independent real sessions',
  { timeout: 30_000 },
  async (t) => {
    const admin = await signedIn(t);
    const creator = await signedIn(t, [], creatorCredentials);
    const adminProfile = (await api(admin, 'GET', '/me')).user;
    const creatorProfile = (await api(creator, 'GET', '/me')).user;
    assert.equal(adminProfile.username, 'email.e2e.admin');
    assert.equal(adminProfile.role, 'admin');
    assert.equal(creatorProfile.username, 'assignment.creator');
    assert.equal(creatorProfile.role, 'requester');
    assert.notEqual(creatorProfile.id, adminProfile.id);
  },
);

async function signedIn(t, errors = [], credentials) {
  let page;
  t.after(async () => {
    if (!page || page.isClosed()) return;
    const name = `${t.name}-${credentials?.username ?? 'admin'}`
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .slice(0, 180);
    await page.screenshot({
      path: join(system.evidence, `${name}.png`),
      fullPage: true,
    });
    await writeFile(
      join(system.evidence, `${name}.html`),
      await page.content(),
    );
  });
  page = await loginPage(system, t, errors, credentials);
  return page;
}

async function actors(t, creatorErrors = []) {
  const admin = await signedIn(t);
  const creator = await signedIn(t, creatorErrors, creatorCredentials);
  const provisionedFirst = await signedIn(t, [], firstCredentials);
  const provisionedSecond = await signedIn(t, [], secondCredentials);
  const firstProfile = (await api(provisionedFirst, 'GET', '/me')).user;
  const secondProfile = (await api(provisionedSecond, 'GET', '/me')).user;
  for (const profile of [firstProfile, secondProfile]) {
    await api(admin, 'PUT', `/admin/users/${profile.id}`, {
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
  }
  await provisionedFirst.context().close();
  await provisionedSecond.context().close();
  const first = await signedIn(t, [], firstCredentials);
  const second = await signedIn(t, [], secondCredentials);
  assert.equal((await api(first, 'GET', '/me')).user.role, 'setup_owner');
  assert.equal(
    (await api(second, 'GET', '/me')).user.setupOwnerDepartment,
    'GNTC',
  );
  return { admin, creator, first, second, firstProfile, secondProfile };
}

// Break caught: assignment overwrites dirty form edits, unrelated saves erase legacy owner data, or conflict refresh clears a selected UUID.
test(
  'pending edits block assignment, unrelated edits preserve legacy ownership, and a conflict retains the selected owner',
  { timeout: 120_000 },
  async (t) => {
    const expectedCreatorErrors = [];
    const { admin, creator, second, firstProfile, secondProfile } =
      await actors(t, expectedCreatorErrors);
    let request = await submit(
      creator,
      await draft(creator, 'Legacy edit preservation'),
    );
    await system.database.query(
      'UPDATE psf_requests SET setup_owner=$2, setup_owner_role=$3 WHERE id=$1',
      [request.id, 'Recorded Legacy Owner', 'GNTC'],
    );
    await system.database.query(
      'UPDATE psf_request_search_index SET setup_owner=$2, setup_owner_role=$3 WHERE request_id=$1',
      [request.id, 'Recorded Legacy Owner', 'GNTC'],
    );
    await creator.goto(`${system.origin}/requests/${request.id}`);
    await creator
      .getByRole('tab', { name: 'Requester Information', exact: true })
      .click();
    const requesterPanel = creator.getByRole('tabpanel', {
      name: 'Requester Information',
      exact: true,
    });
    await requesterPanel
      .getByRole('button', { name: 'Edit information', exact: true })
      .click();
    await requesterPanel
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('Unrelated requester edit');
    await creator
      .getByRole('button', { name: 'Change owner', exact: true })
      .click();
    let dialog = creator.getByRole('dialog', {
      name: 'Change owner',
      exact: true,
    });
    await dialog
      .getByRole('combobox', { name: 'Setup owner', exact: true })
      .selectOption(firstProfile.id);
    await expect(
      dialog.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      requesterPanel.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue('Unrelated requester edit');
    await creator
      .getByLabel('Breadcrumbs')
      .getByRole('link', { name: 'Requests', exact: true })
      .click();
    const leave = creator.getByRole('dialog', {
      name: 'Discard unsaved changes?',
      exact: true,
    });
    await expect(leave).toBeVisible();
    await leave
      .getByRole('button', { name: 'Stay on page', exact: true })
      .click();
    await expect(creator).toHaveURL(`${system.origin}/requests/${request.id}`);
    const savingData = creator.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/requests/${request.id}/requester-data`) &&
        response.request().method() === 'PUT',
    );
    await requesterPanel
      .getByRole('button', { name: 'Save information', exact: true })
      .click();
    const savedDataResponse = await savingData;
    assert.equal(
      savedDataResponse.status(),
      200,
      await savedDataResponse.text(),
    );
    request = await savedDataResponse.json();
    assert.equal(request.setupOwnerUserId, null);
    assert.equal(request.setupOwner, 'Recorded Legacy Owner');
    assert.equal(
      (await index(request.id))[0].setup_owner,
      'Recorded Legacy Owner',
    );
    assert.equal((await index(request.id))[0].setup_owner_user_id, null);

    await second.goto(`${system.origin}/requests/${request.id}`);
    await second
      .getByRole('tab', { name: 'PSF Created Information', exact: true })
      .click();
    const psfPanel = second.getByRole('tabpanel', {
      name: 'PSF Created Information',
      exact: true,
    });
    await psfPanel
      .getByRole('button', { name: 'Edit information', exact: true })
      .click();
    await psfPanel
      .getByLabel('PSF Setup File Name', { exact: true })
      .fill('Unsaved PSF value');
    await second
      .getByRole('button', { name: 'Change owner', exact: true })
      .click();
    const blockedPsfDialog = second.getByRole('dialog', {
      name: 'Change owner',
      exact: true,
    });
    await blockedPsfDialog
      .getByRole('combobox', { name: 'Setup owner', exact: true })
      .selectOption(secondProfile.id);
    await expect(
      blockedPsfDialog.getByRole('button', {
        name: 'Save assignment',
        exact: true,
      }),
    ).toBeDisabled();
    await second.keyboard.press('Escape');
    await expect(
      psfPanel.getByLabel('PSF Setup File Name', { exact: true }),
    ).toHaveValue('Unsaved PSF value');
    await psfPanel.getByRole('button', { name: 'Cancel', exact: true }).click();

    await creator
      .getByRole('button', { name: 'Change owner', exact: true })
      .click();
    dialog = creator.getByRole('dialog', { name: 'Change owner', exact: true });
    const ownerPicker = dialog.getByRole('combobox', {
      name: 'Setup owner',
      exact: true,
    });
    await ownerPicker.selectOption(firstProfile.id);
    await dialog
      .getByRole('searchbox', { name: 'Search setup owners', exact: true })
      .fill('No matching name');
    await expect(ownerPicker).toHaveValue(firstProfile.id);
    const nextWorkflow = await api(
      admin,
      'GET',
      `/requests/${request.id}/status-options`,
    );
    assert.ok(
      nextWorkflow.allowedNextStatuses.length,
      'Submitted request has a real next workflow status',
    );
    const moved = await api(admin, 'PUT', `/requests/${request.id}/status`, {
      status: nextWorkflow.allowedNextStatuses[0],
      expectedUpdatedAt: request.updatedAt,
    });
    assert.notEqual(moved.status, request.status);
    const winner = await assignment(admin, moved, secondProfile.id);
    const beforeJobs = await outboxCount(request.id);
    expectedCreatorErrors.push({
      path: `/requests/${request.id}/assignment`,
      status: 409,
    });
    const conflictResponse = creator.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/requests/${request.id}/assignment`) &&
        response.request().method() === 'PUT',
    );
    await dialog
      .getByRole('button', { name: 'Save assignment', exact: true })
      .click();
    assert.equal((await conflictResponse).status(), 409);
    await expect(dialog.getByRole('alert')).toContainText(
      'Your selected owner is preserved',
    );
    await expect(ownerPicker).toHaveValue(firstProfile.id);
    const latestWorkflow = await api(
      admin,
      'GET',
      `/requests/${request.id}/status-options`,
    );
    const statusPicker = creator.getByRole('combobox', {
      name: 'Status',
      exact: true,
    });
    await expect(
      creator.getByRole('region', { name: 'Request header' }),
    ).toContainText(winner.status);
    await expect(statusPicker).toHaveValue(winner.status);
    await expect(statusPicker.locator('option')).toHaveText([
      winner.status,
      ...latestWorkflow.allowedNextStatuses.filter(
        (status) => status !== winner.status,
      ),
    ]);
    assert.equal(
      (await stored(request.id)).setup_owner_user_id,
      secondProfile.id,
    );
    await expect(
      dialog.getByRole('button', { name: 'Save assignment', exact: true }),
    ).toBeEnabled();
    const retryResponse = creator.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/requests/${request.id}/assignment`) &&
        response.request().method() === 'PUT',
    );
    await dialog
      .getByRole('button', { name: 'Save assignment', exact: true })
      .click();
    const retry = await retryResponse;
    assert.equal(retry.status(), 200, await retry.text());
    const final = await retry.json();
    assert.equal(final.setupOwnerUserId, firstProfile.id);
    assert.equal(final.status, winner.status);
    await expect(statusPicker).toHaveValue(winner.status);
    await expect(statusPicker.locator('option')).toHaveText([
      winner.status,
      ...latestWorkflow.allowedNextStatuses.filter(
        (status) => status !== winner.status,
      ),
    ]);
    assert.equal(final.psfReleasedAt, winner.psfReleasedAt);
    assert.equal(
      (await index(request.id))[0].setup_owner_user_id,
      firstProfile.id,
    );
    assert.equal(await outboxCount(request.id), beforeJobs);
    await assignment(admin, final, null);
  },
);

function requesterData(title) {
  return {
    product_type: 'New Product',
    title,
    due_date: '2030-01-15',
    priority: 'High',
    product: 'Assignment Product',
    wafer_fab: 'Assignment FAB',
    probecard_name: 'Assignment Card',
  };
}

async function draft(page, title, setupOwnerUserId) {
  return api(page, 'POST', '/requests', {
    requesterData: requesterData(title),
    ...(setupOwnerUserId === undefined ? {} : { setupOwnerUserId }),
  });
}

async function submit(page, request) {
  const options = await api(
    page,
    'GET',
    `/requests/${request.id}/status-options`,
  );
  assert.ok(
    options.allowedNextStatuses.length,
    'A real Draft transition is configured',
  );
  return api(page, 'POST', `/requests/${request.id}/submit`, {
    formVersion: request.formVersion,
    expectedUpdatedAt: request.updatedAt,
    status: options.allowedNextStatuses[0],
  });
}

async function rejected(page, method, path, data, status) {
  const response = await page.request.fetch(`${system.origin}/api${path}`, {
    method,
    data,
  });
  assert.equal(
    response.status(),
    status,
    `${method} ${path}: ${await response.text()}`,
  );
  return response.json();
}

async function assignment(page, request, setupOwnerUserId) {
  return api(page, 'PUT', `/requests/${request.id}/assignment`, {
    setupOwnerUserId,
    expectedUpdatedAt: request.updatedAt,
  });
}

async function stored(id) {
  return (
    await system.database.query(
      'SELECT request_no, setup_owner_user_id, setup_owner, setup_owner_role, status, psf_released_at, updated_at FROM psf_requests WHERE id=$1',
      [id],
    )
  ).rows[0];
}

async function index(id) {
  return (
    await system.database.query(
      'SELECT setup_owner_user_id, setup_owner, setup_owner_role FROM psf_request_search_index WHERE request_id=$1',
      [id],
    )
  ).rows;
}

async function outboxCount(id) {
  return (
    await system.database.query(
      'SELECT COUNT(*)::int AS count FROM email_outbox WHERE request_id=$1',
      [id],
    )
  ).rows[0].count;
}

async function ownerDashboard(page, requestNo, count) {
  await page.goto(`${system.origin}/dashboard`);
  const relationship = page.getByRole('combobox', {
    name: 'Relationship',
    exact: true,
  });
  await expect(relationship).toHaveValue('all');
  await expect(page.getByLabel('Dashboard pagination')).toHaveText(
    count ? `1–${count} of ${count} requests` : '0 requests',
  );
  await relationship.selectOption('assigned');
  await expect(relationship).toHaveValue('assigned');
  await expect(page.getByLabel('Dashboard pagination')).toHaveText(
    count ? `1–${count} of ${count} requests` : '0 requests',
  );
  await expect(
    page.getByRole('button', { name: /^Open work/ }).locator('strong'),
  ).toHaveText(String(count));
  await expect(
    page.getByRole('button', { name: /^Overdue/ }).locator('strong'),
  ).toHaveText('0');
  await expect(
    page.getByRole('button', { name: /^Completed/ }).locator('strong'),
  ).toHaveText('0');
  await expect(
    page
      .getByRole('region', { name: 'Related request queue' })
      .getByRole('row', { name: `Open ${requestNo} details`, exact: true }),
  ).toHaveCount(count ? 1 : 0);
}

async function selectOwnerByLabel(picker, userId) {
  if (userId === null) {
    await picker.selectOption({ label: 'Unassigned' });
    return;
  }
  const option = picker.getByRole('option', {
    name: new RegExp(`^Account ID ${userId.slice(0, 8)}`),
  });
  await expect(option).toHaveCount(1);
  const label = await option.textContent();
  assert.match(label, /^Account ID [a-z0-9-]+ — Same Name Owner \/ GNTC$/);
  await picker.selectOption({ label });
  await expect(picker).toHaveValue(userId);
}

async function changeInBrowser(page, request, userId) {
  await page.goto(`${system.origin}/requests/${request.id}`);
  const trigger = page.getByRole('button', {
    name: request.setupOwner ? 'Change owner' : 'Assign owner',
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: request.setupOwner ? 'Change owner' : 'Assign owner',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  assert.ok(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    'Opening the native modal places focus inside it',
  );
  await dialog
    .getByRole('searchbox', { name: 'Search setup owners', exact: true })
    .fill('Same Name');
  await selectOwnerByLabel(
    dialog.getByRole('combobox', { name: 'Setup owner', exact: true }),
    userId,
  );
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/requests/${request.id}/assignment`) &&
      response.request().method() === 'PUT',
  );
  await dialog
    .getByRole('button', { name: 'Save assignment', exact: true })
    .click();
  const saved = await response;
  assert.equal(saved.status(), 200, await saved.text());
  await expect(dialog).not.toBeVisible();
  return saved.json();
}

async function screenshot(page, name) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: join(system.evidence, name), fullPage: true });
}
async function visualMatrix(page, name, openModal) {
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const toggle = page.getByRole('button', {
      name: /Switch to (light|dark) mode/,
    });
    await expect(toggle).toBeVisible();
    const desired =
      theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    if ((await toggle.getAttribute('aria-label')) !== desired)
      await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', desired);
    const dialog = openModal ? await openModal() : null;
    for (const [viewport, size] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      await page.setViewportSize(size);
      await screenshot(page, `${name}-${viewport}-${theme}.png`);
      if (dialog)
        assert.equal(
          await dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
          true,
          'Modal content fits its width',
        );
    }
    if (dialog) {
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('button', { name: 'Switch to light mode', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Switch to dark mode', exact: true }),
  ).toBeVisible();
}

// Break caught: Draft assignment leaks a private request or display names/departments route another user's queue.
test(
  'assigned Draft stays private and only the selected UUID receives submitted work; creator can reassign and clear',
  { timeout: 120_000 },
  async (t) => {
    const { admin, creator, first, second, firstProfile, secondProfile } =
      await actors(t);
    const directory = await api(creator, 'GET', '/requests/assignees');
    assert.deepEqual(
      directory.items.map((entry) => Object.keys(entry).sort()),
      directory.items.map(() => ['displayName', 'id', 'setupOwnerDepartment']),
    );
    assert.deepEqual(
      directory.items.map((entry) => entry.id).sort(),
      [firstProfile.id, secondProfile.id].sort(),
    );
    assert.equal(
      directory.items.filter(
        (entry) =>
          entry.displayName === 'Same Name Owner' &&
          entry.setupOwnerDepartment === 'GNTC',
      ).length,
      2,
    );
    await rejected(creator, 'GET', '/admin/users', undefined, 403);

    await creator.goto(`${system.origin}/requests/new`);
    await creator
      .getByRole('radio', { name: 'New Product', exact: true })
      .check();
    for (const [label, value] of [
      ['Title', 'UUID ownership browser flow'],
      ['Due Date', '2030-01-15'],
      ['Product', 'Assignment Product'],
      ['Wafer FAB', 'Assignment FAB'],
      ['Probecard Name', 'Assignment Card'],
    ]) {
      const control =
        label === 'Due Date'
          ? creator.getByLabel('Due Date', { exact: false })
          : creator.getByRole('textbox', { name: label, exact: true });
      await control.fill(value);
    }
    await creator
      .getByRole('combobox', { name: 'Priority', exact: true })
      .selectOption('High');
    await creator.setViewportSize({ width: 390, height: 844 });
    const draftPicker = creator.getByRole('combobox', {
      name: 'Setup owner',
      exact: true,
    });
    const ownerLabels = await draftPicker.getByRole('option').allTextContents();
    assert.equal(
      new Set(ownerLabels).size,
      ownerLabels.length,
      'Identical name/Dept accounts have distinct visible and accessible labels',
    );
    await selectOwnerByLabel(draftPicker, firstProfile.id);
    await creator
      .getByRole('searchbox', { name: 'Search setup owners', exact: true })
      .fill(firstProfile.id.slice(0, 8));
    await expect(draftPicker.getByRole('option')).toHaveCount(2);
    await screenshot(creator, 'assignment-distinct-label-mobile.png');
    await creator
      .getByRole('searchbox', { name: 'Search setup owners', exact: true })
      .fill('');
    await creator.setViewportSize({ width: 1440, height: 1000 });
    const creation = creator.waitForResponse(
      (response) =>
        response.url().endsWith('/api/requests') &&
        response.request().method() === 'POST',
    );
    await creator
      .getByRole('button', { name: 'Save draft request', exact: true })
      .click();
    const savedDraft = await (await creation).json();
    assert.equal(savedDraft.setupOwnerUserId, firstProfile.id);
    assert.equal(savedDraft.status, 'Draft');
    assert.deepEqual(await index(savedDraft.id), []);
    for (const page of [first, second, admin]) {
      await rejected(page, 'GET', `/requests/${savedDraft.id}`, undefined, 403);
      await rejected(
        page,
        'PUT',
        `/requests/${savedDraft.id}/assignment`,
        {
          setupOwnerUserId: secondProfile.id,
          expectedUpdatedAt: savedDraft.updatedAt,
        },
        403,
      );
      const listed = await api(page, 'GET', '/requests?scope=all');
      assert.equal(
        listed.items.some((entry) => entry.requestId === savedDraft.id),
        false,
        'Private assigned Draft is excluded from submitted request listings',
      );
    }
    await ownerDashboard(first, savedDraft.requestNo, 0);
    await ownerDashboard(second, savedDraft.requestNo, 0);
    await creator.goto(`${system.origin}/requests/${savedDraft.id}`);
    const options = await api(
      creator,
      'GET',
      `/requests/${savedDraft.id}/status-options`,
    );
    await creator
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption(options.allowedNextStatuses[0]);
    const submission = creator.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/requests/${savedDraft.id}/submit`) &&
        response.request().method() === 'POST',
    );
    await creator
      .getByRole('button', { name: 'Submit request', exact: true })
      .click();
    const submissionResponse = await submission;
    assert.equal(
      submissionResponse.status(),
      201,
      await submissionResponse.text(),
    );
    const submitted = await submissionResponse.json();
    assert.notEqual(submitted.status, 'Draft');
    assert.ok(submitted.submittedAt);
    assert.equal((await stored(submitted.id)).request_no, submitted.requestNo);
    assert.equal(
      (await stored(submitted.id)).setup_owner_user_id,
      firstProfile.id,
    );
    assert.equal(
      (await index(submitted.id))[0].setup_owner_user_id,
      firstProfile.id,
    );
    await ownerDashboard(first, submitted.requestNo, 1);
    await ownerDashboard(second, submitted.requestNo, 0);
    for (const page of [admin, creator]) {
      await page.goto(`${system.origin}/dashboard`);
      await expect(
        page.getByRole('combobox', { name: 'Relationship', exact: true }),
      ).toHaveCount(0);
    }

    const beforeMail = await outboxCount(submitted.id);
    const reassigned = await changeInBrowser(
      creator,
      submitted,
      secondProfile.id,
    );
    assert.equal(reassigned.status, submitted.status);
    assert.equal(reassigned.psfReleasedAt, submitted.psfReleasedAt);
    assert.equal(
      (await stored(submitted.id)).setup_owner_user_id,
      secondProfile.id,
    );
    assert.equal(
      (await index(submitted.id))[0].setup_owner_user_id,
      secondProfile.id,
    );
    await ownerDashboard(first, submitted.requestNo, 0);
    await ownerDashboard(second, submitted.requestNo, 1);
    const history = await api(
      creator,
      'GET',
      `/requests/${submitted.id}/history`,
    );
    const event = history.find(
      (entry) =>
        entry.actionType === 'REQUEST_ASSIGNEE_CHANGED' &&
        entry.metadata.before.setupOwnerUserId === firstProfile.id,
    );
    assert.ok(event);
    assert.equal(event.actorDisplayName, 'Assignment Creator');
    assert.deepEqual(event.metadata.after, {
      setupOwnerUserId: secondProfile.id,
      setupOwner: 'Same Name Owner',
      setupOwnerRole: 'GNTC',
    });
    const global = await api(
      admin,
      'GET',
      `/audit-logs?requestId=${submitted.id}&actionType=REQUEST_ASSIGNEE_CHANGED`,
    );
    assert.ok(
      global.some(
        (entry) =>
          entry.requestNo === submitted.requestNo &&
          entry.metadata.after.setupOwnerUserId === secondProfile.id,
      ),
    );
    await creator.goto(`${system.origin}/requests/${submitted.id}`);
    await creator.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(
      creator.getByRole('tabpanel', { name: 'History' }),
    ).toContainText('Same Name Owner');

    await admin.goto(`${system.origin}/history`);
    await admin.getByLabel('Request ID', { exact: true }).fill(submitted.id);
    await admin
      .getByRole('combobox', { name: 'Action', exact: true })
      .selectOption('REQUEST_ASSIGNEE_CHANGED');
    await admin.getByRole('button', { name: 'Apply', exact: true }).click();
    const globalHistory = admin.getByRole('region', {
      name: 'Global audit history',
      exact: true,
    });
    await expect(globalHistory).toContainText(submitted.requestNo);
    await expect(globalHistory).toContainText('Request assignee changed');
    await expect(globalHistory).toContainText('Assignment Creator');
    await expect(globalHistory).toContainText('Same Name Owner');
    const cleared = await changeInBrowser(creator, reassigned, null);
    assert.equal(cleared.setupOwnerUserId, null);
    assert.equal(cleared.setupOwner, null);
    assert.equal(cleared.setupOwnerRole, null);
    assert.equal(
      await outboxCount(submitted.id),
      beforeMail,
      'Standalone assignment changes queue no notification jobs',
    );
    await ownerDashboard(second, submitted.requestNo, 0);
    await creator.goto(`${system.origin}/requests/${submitted.id}`);
    await expect(
      creator.getByRole('region', { name: 'Request metadata' }),
    ).toContainText('Unassigned');
  },
);

// Break caught: eligibility checked only during Draft save, invalid UUID silently accepted, or stale revision overwrites the winner.
test(
  'stale eligibility blocks Submit until explicit clearing and revision conflicts preserve committed assignment',
  { timeout: 120_000 },
  async (t) => {
    const { admin, creator, first, second, firstProfile, secondProfile } =
      await actors(t);
    const pending = await draft(creator, 'Stale owner Draft', firstProfile.id);
    await api(admin, 'PUT', `/admin/users/${firstProfile.id}`, {
      role: 'requester',
      setupOwnerDepartment: null,
    });
    const directory = await api(creator, 'GET', '/requests/assignees');
    assert.equal(
      directory.items.some((entry) => entry.id === firstProfile.id),
      false,
    );
    const options = await api(
      creator,
      'GET',
      `/requests/${pending.id}/status-options`,
    );
    await rejected(
      creator,
      'POST',
      `/requests/${pending.id}/submit`,
      {
        formVersion: pending.formVersion,
        expectedUpdatedAt: pending.updatedAt,
        status: options.allowedNextStatuses[0],
      },
      400,
    );
    assert.equal((await stored(pending.id)).status, 'Draft');
    assert.deepEqual(await index(pending.id), []);
    await rejected(
      creator,
      'PUT',
      `/requests/${pending.id}/assignment`,
      {
        setupOwnerUserId: '00000000-0000-4000-8000-000000000099',
        expectedUpdatedAt: pending.updatedAt,
      },
      400,
    );
    await rejected(
      creator,
      'PUT',
      `/requests/${pending.id}/assignment`,
      { setupOwnerUserId: 'invalid-id', expectedUpdatedAt: pending.updatedAt },
      400,
    );
    const clear = await assignment(creator, pending, null);
    let submitted = await submit(creator, clear);
    submitted = await assignment(second, submitted, secondProfile.id);
    const same = await assignment(admin, submitted, secondProfile.id);
    assert.equal(
      same.updatedAt,
      submitted.updatedAt,
      'Selecting the same assignment is a no-op',
    );
    const eventsBefore = (
      await api(admin, 'GET', `/requests/${submitted.id}/history`)
    ).filter((entry) => entry.actionType === 'REQUEST_ASSIGNEE_CHANGED').length;
    const winner = await assignment(admin, submitted, null);
    await rejected(
      second,
      'PUT',
      `/requests/${submitted.id}/assignment`,
      {
        setupOwnerUserId: secondProfile.id,
        expectedUpdatedAt: submitted.updatedAt,
      },
      409,
    );
    assert.equal((await stored(winner.id)).setup_owner_user_id, null);
    assert.equal((await index(winner.id))[0].setup_owner_user_id, null);
    assert.equal(
      (await api(admin, 'GET', `/requests/${winner.id}/history`)).filter(
        (entry) => entry.actionType === 'REQUEST_ASSIGNEE_CHANGED',
      ).length,
      eventsBefore + 1,
    );
    const current = await api(first, 'GET', `/requests/${winner.id}`);
    assert.equal(
      current.canEditPsfCreatedData,
      false,
      'Assignment does not grant a requester editing rights',
    );
    await rejected(
      first,
      'PUT',
      `/requests/${winner.id}/psf-created-data`,
      { expectedUpdatedAt: current.updatedAt, psfCreatedData: {} },
      403,
    );
  },
);

// Break caught: PSF saving claims ownership, another mutation drops the UUID, or legacy display is guessed into a user ID.
test(
  'old owner snapshots survive profile changes and legacy work stays department-only; PSF save never claims',
  { timeout: 120_000 },
  async (t) => {
    const { admin, creator, first, second, firstProfile, secondProfile } =
      await actors(t);
    let request = await submit(
      creator,
      await draft(creator, 'Snapshot ownership', firstProfile.id),
    );
    const beforeMail = await outboxCount(request.id);
    await api(admin, 'PUT', `/admin/users/${firstProfile.id}`, {
      role: 'setup_owner',
      setupOwnerDepartment: 'MFG',
    });
    const afterProfileChange = await api(
      admin,
      'GET',
      `/requests/${request.id}`,
    );
    assert.equal(afterProfileChange.setupOwnerRole, 'GNTC');
    assert.equal(afterProfileChange.setupOwnerUserId, firstProfile.id);
    const noOpAfterProfileChange = await assignment(
      admin,
      afterProfileChange,
      firstProfile.id,
    );
    assert.equal(
      noOpAfterProfileChange.updatedAt,
      afterProfileChange.updatedAt,
    );
    assert.equal(noOpAfterProfileChange.setupOwnerRole, 'GNTC');
    request = await api(
      second,
      'PUT',
      `/requests/${request.id}/psf-created-data`,
      {
        expectedUpdatedAt: request.updatedAt,
        psfCreatedData: { psf_setup_file_name: 'Other owner saved PSF' },
      },
    );
    assert.equal(request.setupOwnerUserId, firstProfile.id);
    assert.equal(
      (await index(request.id))[0].setup_owner_user_id,
      firstProfile.id,
    );
    const unassigned = await submit(
      creator,
      await draft(creator, 'Unassigned submit succeeds'),
    );
    const psfSaved = await api(
      second,
      'PUT',
      `/requests/${unassigned.id}/psf-created-data`,
      {
        expectedUpdatedAt: unassigned.updatedAt,
        psfCreatedData: { psf_setup_file_name: 'No auto claim' },
      },
    );
    assert.equal(psfSaved.setupOwnerUserId, null);
    assert.equal(psfSaved.setupOwner, null);
    assert.equal(psfSaved.setupOwnerRole, null);
    assert.equal((await index(psfSaved.id))[0].setup_owner_user_id, null);
    assert.equal(await outboxCount(request.id), beforeMail);

    const legacy = await submit(
      creator,
      await draft(creator, 'Legacy name department only'),
    );
    await system.database.query(
      'UPDATE psf_requests SET setup_owner=$2, setup_owner_role=$3, setup_owner_user_id=NULL WHERE id=$1',
      [legacy.id, 'Same Name Owner', 'GNTC'],
    );
    await system.database.query(
      'UPDATE psf_request_search_index SET setup_owner=$2, setup_owner_role=$3, setup_owner_user_id=NULL WHERE request_id=$1',
      [legacy.id, 'Same Name Owner', 'GNTC'],
    );
    let old = await api(second, 'GET', `/requests/${legacy.id}`);
    assert.equal(old.setupOwnerUserId, null);
    assert.equal(old.setupOwner, 'Same Name Owner');
    old = await api(second, 'PUT', `/requests/${old.id}/psf-created-data`, {
      expectedUpdatedAt: old.updatedAt,
      psfCreatedData: { psf_setup_file_name: 'Legacy remains unbound' },
    });
    assert.equal(old.setupOwnerUserId, null);
    assert.equal(old.setupOwnerRole, 'GNTC');
    assert.equal((await index(old.id))[0].setup_owner_user_id, null);
    const assigned = await api(
      second,
      'GET',
      '/requests?scope=related&relation=assigned&workState=all',
    );
    assert.equal(
      assigned.items.some((entry) => entry.requestId === old.id),
      false,
    );
    const department = await api(
      second,
      'GET',
      '/requests?scope=related&relation=department&workState=all',
    );
    assert.ok(department.items.some((entry) => entry.requestId === old.id));
    const replaced = await assignment(admin, old, secondProfile.id);
    assert.equal(replaced.setupOwnerUserId, secondProfile.id);
    assert.equal(
      (await index(old.id))[0].setup_owner_user_id,
      secondProfile.id,
    );

    await first.goto(`${system.origin}/dashboard`);
    await first
      .getByRole('combobox', { name: 'Relationship', exact: true })
      .selectOption('assigned');
    await visualMatrix(first, 'assignment-dashboard');
    await creator.goto(`${system.origin}/requests/${replaced.id}`);
    await visualMatrix(creator, 'assignment-dialog', async () => {
      await creator
        .getByRole('button', { name: 'Change owner', exact: true })
        .click();
      const dialog = creator.getByRole('dialog', {
        name: 'Change owner',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      return dialog;
    });
    await creator
      .getByRole('button', { name: 'Change owner', exact: true })
      .click();
    await creator.keyboard.press('Escape');
    await expect(
      creator.getByRole('button', { name: 'Change owner', exact: true }),
    ).toBeFocused();
  },
);
