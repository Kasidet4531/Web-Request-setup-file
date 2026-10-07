import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
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

const requesterSchema = {
  formKey: 'psf-request',
  title: 'Configured requester form',
  sections: [
    {
      sectionKey: 'request',
      title: 'Request sequence',
      fields: [
        {
          fieldKey: 'title',
          canonicalKey: 'title',
          label: 'Configured title',
          type: 'text',
          required: true,
          searchable: true,
        },
        {
          fieldKey: 'request_note',
          canonicalKey: 'request_note',
          label: 'Optional note between required fields',
          type: 'textarea',
          required: false,
        },
        {
          fieldKey: 'priority',
          canonicalKey: 'priority',
          label: 'Configured priority',
          type: 'select',
          options: ['Normal', 'High'],
          required: true,
        },
        {
          fieldKey: 'reference_psf_name',
          canonicalKey: 'reference_psf_name',
          label: 'Optional reference',
          type: 'text',
          required: false,
          autofillTrigger: true,
        },
        {
          fieldKey: 'due_date',
          canonicalKey: 'due_date',
          label: 'Configured due date',
          type: 'date',
          required: true,
        },
      ],
    },
    {
      sectionKey: 'identity',
      title: 'Identity and product',
      fields: [
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester identity sample',
          type: 'text',
          required: true,
        },
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Configured product type',
          type: 'radio',
          options: ['New Product', 'Transfer Product'],
          required: true,
        },
      ],
    },
  ],
};
const createdSchema = {
  formKey: 'psf-created-information',
  title: 'Configured PSF form',
  sections: [
    {
      sectionKey: 'psf',
      title: 'PSF sequence',
      fields: [
        {
          fieldKey: 'psf_setup_file_name',
          canonicalKey: 'psf_setup_file_name',
          label: 'Configured setup name',
          type: 'text',
          required: true,
        },
        {
          fieldKey: 'psf_note',
          canonicalKey: 'psf_note',
          label: 'Optional PSF note',
          type: 'textarea',
          required: false,
        },
        {
          fieldKey: 'psf_choice',
          canonicalKey: 'psf_choice',
          label: 'Configured PSF choice',
          type: 'select',
          options: ['Standard', 'Custom'],
          required: true,
        },
        {
          fieldKey: 'psf_date',
          canonicalKey: 'psf_date',
          label: 'Optional PSF date',
          type: 'date',
          required: false,
        },
        {
          fieldKey: 'psf_mode',
          canonicalKey: 'psf_mode',
          label: 'Configured PSF mode',
          type: 'radio',
          options: ['A', 'B'],
          required: true,
        },
      ],
    },
  ],
};
const requesterOrder = [
  'Configured title',
  'Optional note between required fields',
  'Configured priority',
  'Optional reference',
  'Configured due date',
  'Requester identity sample',
  'Configured product type',
];
const createdOrder = [
  'Configured setup name',
  'Optional PSF note',
  'Configured PSF choice',
  'Optional PSF date',
  'Configured PSF mode',
];

function configPath(formKey) {
  return `/admin/form-config${formKey === 'psf-request' ? '' : `?formKey=${formKey}`}`;
}
function editorPath(formKey, version) {
  return `/admin/form-config/${formKey === 'psf-request' ? '' : `${formKey}/`}${version}`;
}
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

async function configuredDraft(page, schema) {
  const versions = await api(page, 'GET', configPath(schema.formKey));
  const active = versions.versions.find(
    (version) => version.status === 'active',
  );
  const copy = await api(
    page,
    'POST',
    `/admin/form-config/duplicate${schema.formKey === 'psf-request' ? '' : `?formKey=${schema.formKey}`}`,
    { version: active.version },
  );
  return api(page, 'PUT', configPath(schema.formKey), {
    draftVersion: copy.version,
    schema,
  });
}
async function publish(page, draft) {
  return api(
    page,
    'POST',
    `/admin/form-config/publish${draft.formKey === 'psf-request' ? '' : `?formKey=${draft.formKey}`}`,
    { version: draft.version },
  );
}
async function preview(page) {
  const trigger = page.getByRole('button', {
    name: 'Preview form',
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Form preview',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  assert.ok(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    'Preview modal receives keyboard focus',
  );
  return dialog;
}
async function expectOrder(scope, labels) {
  await expect(
    scope.getByRole('textbox', { name: labels[0], exact: true }),
  ).toBeVisible();
  await expect(
    scope.getByText('Additional details', { exact: true }),
  ).toHaveCount(0);
  // A DOM-order assertion catches optional fields moved out of the configured sequence.
  const rendered = await scope
    .locator('.dynamic-form__label')
    .allTextContents();
  assert.deepEqual(
    rendered.map((text) => text.replace(/\s*\*\s*$/, '').trim()),
    labels,
  );
}
async function screenshot(page, name) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: join(system.evidence, name),
    fullPage: (await page.getByRole('dialog').count()) === 0,
  });
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
      if (dialog && viewport === 'mobile') {
        const check = dialog.getByRole('button', {
          name: 'Check required fields',
          exact: true,
        });
        await check.focus();
        await expect(check).toBeFocused();
        await expect(check).toBeInViewport();
        await page.keyboard.press('Enter');
        await screenshot(page, `${name}-${viewport}-${theme}-validation.png`);
      }
    }
    if (dialog) {
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Preview form', exact: true }),
      ).toBeFocused();
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

async function counts() {
  const result = await system.database.query(
    'SELECT (SELECT COUNT(*)::int FROM psf_requests) AS requests, (SELECT COUNT(*)::int FROM email_outbox) AS outbox',
  );
  return result.rows[0];
}
function monitorPreview(page) {
  const forbidden = [];
  const listener = (request) => {
    const url = new URL(request.url());
    if (url.origin !== system.origin || !url.pathname.startsWith('/api/'))
      return;
    if (
      url.pathname === '/api/autofill' ||
      (url.pathname.startsWith('/api/requests') &&
        request.method() !== 'GET') ||
      (url.pathname.startsWith('/api/admin/form-config') &&
        request.method() !== 'GET')
    ) {
      forbidden.push(`${request.method()} ${url.pathname}`);
    }
  };
  page.on('request', listener);
  return {
    forbidden,
    close() {
      page.off('request', listener);
    },
  };
}

// Break caught: Preview uses saved config, groups optional fields, calls runtime autofill, writes business data, or dirties config through trial values.
test(
  'requester preview uses unsaved controls and order, validates locally, resets across versions, and matches New Request',
  { timeout: 120_000 },
  async (t) => {
    const page = await signedIn(t);
    const originalVersions = await api(page, 'GET', '/admin/form-config');
    const original = originalVersions.versions.find(
      (version) => version.status === 'active',
    );
    const historicalRequest = await api(page, 'POST', '/requests', {
      requesterData: { title: 'Historical schema snapshot' },
    });
    const draft = await configuredDraft(page, requesterSchema);
    await page.goto(`${system.origin}/admin/form-config`);
    const activeRow = page.getByRole('row').filter({
      has: page.getByRole('link', {
        name: `View form version ${original.version}`,
        exact: true,
      }),
    });
    await expect(activeRow.getByRole('link', { name: /^Edit/ })).toHaveCount(0);
    await expect(
      page.getByRole('link', {
        name: `Edit form version ${draft.version}`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('link', {
        name: `Edit form version ${draft.version}`,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `${system.origin}${editorPath('psf-request', draft.version)}`,
    );
    await expect(
      page.getByRole('complementary', { name: 'Form family selection' }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Family: psf-request', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        'Default requester-facing MVP schema for local PSF request creation.',
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true }),
    ).toBeDisabled();
    let dialog = await preview(page);
    await expectOrder(dialog, requesterOrder);
    await dialog
      .getByRole('textbox', { name: 'Configured title', exact: true })
      .fill('Temporary trial');
    await dialog
      .getByLabel('Optional reference', { exact: true })
      .fill('Preview must not autofill');
    await dialog
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    await expect(
      dialog.getByRole('combobox', {
        name: 'Configured priority',
        exact: true,
      }),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(
      dialog.getByLabel('Requester identity sample', { exact: false }),
    ).toHaveText('Sample requester (preview only)');
    await expect(
      dialog.locator(
        'input[name="requester_name"], textarea[name="requester_name"]',
      ),
    ).toHaveCount(0);
    await dialog
      .getByRole('button', { name: 'Close preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Preview form', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true }),
    ).toBeDisabled();

    const unsaved = structuredClone(requesterSchema);
    unsaved.sections[0].fields[0].label = 'Unsaved title label';
    unsaved.sections[0].fields[2].options = ['Normal', 'Rush'];
    await page
      .getByText('Advanced · Edit schema JSON', { exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Schema JSON', exact: true })
      .fill(JSON.stringify(unsaved, null, 2));
    const before = await counts();
    const network = monitorPreview(page);
    dialog = await preview(page);
    await expectOrder(dialog, [
      'Unsaved title label',
      ...requesterOrder.slice(1),
    ]);
    await dialog
      .getByRole('textbox', { name: 'Unsaved title label', exact: true })
      .fill('Unsaved preview value');
    await dialog
      .getByRole('combobox', { name: 'Configured priority', exact: true })
      .selectOption('Rush');
    await dialog
      .getByLabel('Configured due date', { exact: false })
      .fill('2030-01-15');
    await dialog
      .getByRole('radio', { name: 'New Product', exact: true })
      .check();
    await dialog
      .getByLabel('Optional reference', { exact: true })
      .fill('Still no lookup');
    await dialog
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await visualMatrix(page, 'requester-preview', () => preview(page));
    network.close();
    assert.deepEqual(
      network.forbidden,
      [],
      'Preview emits no config/request writes or runtime autofill calls',
    );
    assert.deepEqual(
      await counts(),
      before,
      'Trial input creates no requests or email jobs',
    );
    const stillSaved = await api(page, 'GET', '/admin/form-config');
    assert.equal(
      stillSaved.versions.find((version) => version.version === draft.version)
        .schema.sections[0].fields[0].label,
      'Configured title',
    );
    assert.deepEqual(
      stillSaved.versions.find((version) => version.version === draft.version)
        .schema.sections[0].fields[2].options,
      ['Normal', 'High'],
    );
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true }),
    ).toBeDisabled();
    const active = await publish(page, draft);
    await page.goto(`${system.origin}/requests/new`);
    await expectOrder(page, [
      'Unsaved title label',
      ...requesterOrder.slice(1),
    ]);
    await expect(
      page
        .getByRole('combobox', { name: 'Configured priority', exact: true })
        .getByRole('option', { name: 'Rush', exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByLabel('Requester identity sample', { exact: false }),
    ).toHaveText('Email E2E Admin');
    await visualMatrix(page, 'new-request');

    await page.goto(
      `${system.origin}${editorPath('psf-request', original.version)}`,
    );
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true }),
    ).toHaveCount(0);
    dialog = await preview(page);
    await expect(
      dialog.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue('');
    await expect(
      dialog.getByRole('textbox', { name: 'Unsaved title label', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    assert.equal(
      (await api(page, 'GET', '/forms/psf-request/schema')).version,
      active.version,
    );
    const retained = await api(
      page,
      'GET',
      `/requests/${historicalRequest.id}`,
    );
    assert.deepEqual(retained.schemaSnapshot, historicalRequest.schemaSnapshot);
    await page.goto(
      `${system.origin}${editorPath('psf-request', active.version)}`,
    );
    dialog = await preview(page);
    await expect(
      dialog.getByRole('textbox', { name: 'Unsaved title label', exact: true }),
    ).toHaveValue('');
    await dialog
      .getByRole('button', { name: 'Close preview', exact: true })
      .click();
  },
);

// Break caught: the PSF family uses readonly placeholder output or loses config ordering/layout compared with the real Detail editor.
test(
  'PSF preview is interactive with unsaved options and real Detail layout; Detail labels retain separators',
  { timeout: 120_000 },
  async (t) => {
    const page = await signedIn(t);
    const draft = await configuredDraft(page, createdSchema);
    await page.goto(
      `${system.origin}${editorPath('psf-created-information', draft.version)}`,
    );
    await page
      .getByText('Advanced · Edit schema JSON', { exact: true })
      .click();
    const unsaved = structuredClone(createdSchema);
    unsaved.sections[0].fields[0].label = 'Unsaved setup label';
    unsaved.sections[0].fields[2].options = ['Standard', 'Experimental'];
    await page
      .getByRole('textbox', { name: 'Schema JSON', exact: true })
      .fill(JSON.stringify(unsaved, null, 2));
    const before = await counts();
    const network = monitorPreview(page);
    const dialog = await preview(page);
    await expectOrder(dialog, [
      'Unsaved setup label',
      ...createdOrder.slice(1),
    ]);
    await dialog
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    await expect(
      dialog.getByRole('textbox', { name: 'Unsaved setup label', exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
    await dialog
      .getByRole('textbox', { name: 'Unsaved setup label', exact: true })
      .fill('Preview setup');
    await dialog
      .getByLabel('Optional PSF note', { exact: true })
      .fill('Line one\nLine two');
    await dialog
      .getByRole('combobox', { name: 'Configured PSF choice', exact: true })
      .selectOption('Experimental');
    await dialog
      .getByLabel('Optional PSF date', { exact: true })
      .fill('2030-01-15');
    await dialog.getByRole('radio', { name: 'B', exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await visualMatrix(page, 'psf-preview', () => preview(page));
    const removedOptions = structuredClone(unsaved);
    removedOptions.sections[0].fields[2].options = ['Standard', 'Custom'];
    removedOptions.sections[0].fields[4].options = ['A', 'C'];
    await page
      .getByRole('textbox', { name: 'Schema JSON', exact: true })
      .fill(JSON.stringify(removedOptions, null, 2));
    const changedPreview = await preview(page);
    await changedPreview
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    const removedOptionObservation = {
      visibleSelectValue: await changedPreview
        .getByRole('combobox', { name: 'Configured PSF choice', exact: true })
        .inputValue(),
      anyRadioChecked: await changedPreview
        .getByRole('radio', { checked: true })
        .count(),
      invalidControls: await changedPreview
        .locator('[aria-invalid="true"]')
        .count(),
      validationComplete: await changedPreview
        .getByText('All required fields are complete.', { exact: true })
        .isVisible(),
    };
    t.diagnostic(
      `Removed-option Preview observation: ${JSON.stringify(removedOptionObservation)}`,
    );
    await screenshot(page, 'preview-removed-options-observation.png');
    await page.keyboard.press('Escape');
    await page
      .getByRole('textbox', { name: 'Schema JSON', exact: true })
      .fill(JSON.stringify(unsaved, null, 2));
    network.close();
    assert.deepEqual(network.forbidden, []);
    assert.deepEqual(await counts(), before);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save draft', exact: true }),
    ).toBeDisabled();
    await publish(page, draft);
    const request = await api(page, 'POST', '/requests', {
      requesterData: {
        title: 'Layout parity',
        priority: 'Rush',
        due_date: '2030-01-15',
        product_type: 'New Product',
      },
    });
    const options = await api(
      page,
      'GET',
      `/requests/${request.id}/status-options`,
    );
    const submitted = await api(
      page,
      'POST',
      `/requests/${request.id}/submit`,
      {
        formVersion: request.formVersion,
        expectedUpdatedAt: request.updatedAt,
        status: options.allowedNextStatuses[0],
      },
    );
    await page.goto(`${system.origin}/requests/${submitted.id}`);
    await page
      .getByRole('tab', { name: 'PSF Created Information', exact: true })
      .click();
    const panel = page.getByRole('tabpanel', {
      name: 'PSF Created Information',
      exact: true,
    });
    await panel
      .getByRole('button', { name: 'Edit information', exact: true })
      .click();
    await expectOrder(panel, ['Unsaved setup label', ...createdOrder.slice(1)]);
    await panel
      .getByRole('combobox', { name: 'Configured PSF choice', exact: true })
      .selectOption('Experimental');
    await panel
      .getByRole('textbox', { name: 'Unsaved setup label', exact: true })
      .fill('Saved real setup');
    await panel
      .getByLabel('Optional PSF note', { exact: true })
      .fill('Line one\nLine two');
    await panel.getByRole('radio', { name: 'B', exact: true }).check();
    await panel
      .getByRole('button', {
        name: 'Save PSF Created Information',
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole('button', { name: 'Edit information', exact: true }),
    ).toBeVisible();
    const style = await panel
      .locator('.dynamic-form__label')
      .first()
      .evaluate((element) => ({
        fontSize: getComputedStyle(element).fontSize,
        fontWeight: getComputedStyle(element).fontWeight,
        borderBottomWidth: getComputedStyle(element).borderBottomWidth,
        color: getComputedStyle(element).color,
      }));
    assert.equal(style.fontSize, '14px');
    assert.ok(Number(style.fontWeight) >= 600);
    assert.ok(
      parseFloat(style.borderBottomWidth) > 0,
      'Readonly field label has a separator',
    );
    await expect(
      panel.getByRole('status').filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    await expect(
      panel.getByText('Line one\nLine two', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Request metadata' }),
    ).not.toContainText('Owner / Dept');
    await visualMatrix(page, 'detail-labels');
    await page.goto(
      `${system.origin}${editorPath('psf-created-information', draft.version)}`,
    );
    const freshPreview = await preview(page);
    await expect(
      freshPreview.getByRole('textbox', {
        name: 'Unsaved setup label',
        exact: true,
      }),
    ).toHaveValue('');
    await page.keyboard.press('Escape');
  },
);

// Break caught: hiding seed descriptions suppresses admin-authored descriptions or allows seed text to reappear on copies.
test(
  'copied versions hide both stored seed descriptions while preserving custom admin descriptions',
  { timeout: 60_000 },
  async (t) => {
    const page = await signedIn(t);
    for (const [formKey, seedDescription] of [
      [
        'psf-request',
        'Default requester-facing MVP schema for local PSF request creation.',
      ],
      ['psf-created-information', 'Initial PSF Created Information schema.'],
    ]) {
      const versions = await api(page, 'GET', configPath(formKey));
      const original = versions.versions.find(
        (version) => version.version === 1,
      );
      assert.equal(
        original.description,
        seedDescription,
        'Stored seed description is retained',
      );
      const suffix = formKey === 'psf-request' ? '' : `?formKey=${formKey}`;
      const copy = await api(
        page,
        'POST',
        `/admin/form-config/duplicate${suffix}`,
        { version: original.version },
      );
      await page.goto(`${system.origin}${configPath(formKey)}`);
      await expect(
        page.getByText(seedDescription, { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: `Duplicate version ${original.version} as draft`,
          exact: true,
        }),
      ).toBeDisabled();
      await page.goto(`${system.origin}${editorPath(formKey, copy.version)}`);
      await expect(
        page.getByText(seedDescription, { exact: true }),
      ).toHaveCount(0);
      const custom = `Reviewed by admin: ${formKey}`;
      await api(page, 'PUT', configPath(formKey), {
        draftVersion: copy.version,
        schema: copy.schema,
        description: custom,
      });
      await page.reload();
      await expect(page.getByText(custom, { exact: true })).toBeVisible();
      await page.goto(`${system.origin}${configPath(formKey)}`);
      await expect(page.getByText(custom, { exact: true })).toBeVisible();
      const removed = await page.request.delete(
        `${system.origin}/api/admin/form-config/draft/${copy.version}${suffix}`,
      );
      assert.equal(removed.status(), 204);
      const latest = await api(page, 'GET', configPath(formKey));
      assert.equal(
        latest.versions.find((version) => version.version === 1).description,
        seedDescription,
      );
    }
  },
);

// Break caught: trial values removed from required select/radio options remain hidden in state and falsely validate as complete.
test(
  'removed required select and radio choices fail local Preview validation',
  { timeout: 60_000 },
  async (t) => {
    const page = await signedIn(t);
    const draft = await configuredDraft(page, createdSchema);
    await page.goto(
      `${system.origin}${editorPath('psf-created-information', draft.version)}`,
    );
    let dialog = await preview(page);
    await dialog
      .getByRole('textbox', { name: 'Configured setup name', exact: true })
      .fill('Trial setup');
    await dialog
      .getByRole('combobox', { name: 'Configured PSF choice', exact: true })
      .selectOption('Custom');
    await dialog.getByRole('radio', { name: 'B', exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page
      .getByText('Advanced · Edit schema JSON', { exact: true })
      .click();
    const next = structuredClone(createdSchema);
    next.sections[0].fields[2].options = ['Standard', 'Different choice'];
    next.sections[0].fields[4].options = ['A', 'C'];
    await page
      .getByRole('textbox', { name: 'Schema JSON', exact: true })
      .fill(JSON.stringify(next, null, 2));
    dialog = await preview(page);
    await dialog
      .getByRole('button', { name: 'Check required fields', exact: true })
      .click();
    await screenshot(page, 'preview-removed-options-regression.png');
    await expect(
      dialog.getByRole('combobox', {
        name: 'Configured PSF choice',
        exact: true,
      }),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(
      dialog.getByRole('radiogroup', {
        name: 'Configured PSF mode',
        exact: true,
      }),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(
      dialog.getByText('All required fields are complete.', { exact: true }),
    ).toHaveCount(0);
  },
);
