import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { join } from 'node:path';
import { expect } from 'playwright/test';
import { startEmailSystem, loginPage, api } from './email-system.fixture.mjs';

let system;
before(async () => {
  system = await startEmailSystem();
});
after(async () => {
  if (system) await system.close();
});

test(
  'autofill modal persists manual inactivity, explicit activation and canceled edits',
  { timeout: 60_000 },
  async (t) => {
    const page = await loginPage(system, t);
    await page.goto(`${system.origin}/admin/autofill`);
    const opener = page.getByRole('button', {
      name: 'Create rule',
      exact: true,
    });
    await opener.click();
    const create = page.getByRole('dialog', {
      name: 'Create autofill rule',
      exact: true,
    });
    await expect(create).toBeVisible();
    await page.screenshot({
      path: join(system.evidence, 'autofill-create-initial.png'),
    });
    await create
      .getByRole('combobox', { name: /^Autofill trigger field/ })
      .selectOption('reference_psf_name');
    for (const label of ['Title', 'Product', 'Wafer FAB', 'Probecard Name']) {
      await create.getByRole('checkbox', { name: label, exact: true }).check();
    }
    await create
      .getByRole('combobox', { name: /^Rule status/ })
      .selectOption('inactive');
    assert.doesNotMatch(
      await create.innerText(),
      /reference_psf_name|wafer_fab|canonical/i,
    );
    await create
      .getByRole('button', { name: 'Create autofill rule', exact: true })
      .click();
    await expect(create).not.toBeVisible();
    await expect(opener).toBeFocused();
    let [rule] = await api(page, 'GET', '/admin/autofill');
    assert.equal(rule.status, 'inactive');
    assert.equal(rule.inactiveReason, 'Disabled by administrator.');
    const triggerIsActive = async () => {
      const schema = await api(page, 'GET', '/forms/psf-request/schema');
      return (
        schema.schema.sections
          .flatMap((section) => section.fields)
          .find((field) => field.canonicalKey === 'reference_psf_name')
          .autofillTrigger === true
      );
    };
    assert.equal(await triggerIsActive(), false);
    await expect(
      page.getByRole('columnheader', { name: 'Source', exact: true }),
    ).toHaveCount(0);
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText('Reference PSF Name', { exact: true }) });
    assert.doesNotMatch(await row.innerText(), /reference_psf_name|wafer_fab/);
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', {
      name: 'Edit autofill rule',
      exact: true,
    });
    await expect(
      edit.getByRole('combobox', { name: /^Rule status/ }),
    ).toHaveValue('inactive');
    await edit.getByRole('checkbox', { name: 'Priority', exact: true }).check();
    await edit
      .getByRole('button', { name: 'Save autofill rule', exact: true })
      .click();
    await expect(edit).not.toBeVisible();
    [rule] = await api(page, 'GET', '/admin/autofill');
    assert.equal(rule.status, 'inactive');
    assert.ok(rule.targetCanonicalKeys.includes('priority'));
    assert.equal(await triggerIsActive(), false);
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await edit
      .getByRole('combobox', { name: /^Rule status/ })
      .selectOption('active');
    await edit
      .getByRole('button', { name: 'Save autofill rule', exact: true })
      .click();
    await expect(edit).not.toBeVisible();
    assert.equal(await triggerIsActive(), true);
    const stored = await system.database.query(
      'SELECT status, inactive_reason FROM autofill_rules WHERE id = $1',
      [rule.id],
    );
    assert.deepEqual(stored.rows[0], {
      status: 'active',
      inactive_reason: null,
    });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await edit
      .getByRole('combobox', { name: /^Rule status/ })
      .selectOption('inactive');
    await page.keyboard.press('Escape');
    await expect(edit).not.toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Edit', exact: true }),
    ).toBeFocused();
    assert.equal(
      (await api(page, 'GET', '/admin/autofill'))[0].status,
      'active',
    );
  },
);

test(
  'admin dialogs fit desktop/mobile and recipient growth preserves both input positions',
  { timeout: 90_000 },
  async (t) => {
    const page = await loginPage(system, t);
    if (!(await api(page, 'GET', '/admin/autofill')).length)
      await api(page, 'POST', '/admin/autofill', {
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_psf_name',
        targetCanonicalKeys: ['title', 'product', 'wafer_fab'],
        status: 'inactive',
      });
    const config = await api(page, 'GET', '/admin/workflow');
    const updated = await api(page, 'PUT', '/admin/workflow', {
      action: 'create',
      name: 'Recipient layout check',
      kind: 'open',
      expectedUpdatedAt: config.updatedAt,
    });
    const status = updated.entries.find(
      (entry) => entry.name === 'Recipient layout check',
    );
    for (const [size, viewport] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      await page.setViewportSize(viewport);
      for (const mode of ['light', 'dark']) {
        await page.goto(`${system.origin}/admin/autofill`);
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle('dark', dark),
          mode === 'dark',
        );
        await expect(
          page.getByRole('heading', { name: 'Auto-fill Rules', exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: join(system.evidence, `autofill-table-${size}-${mode}.png`),
          fullPage: false,
        });
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        const editor = page.getByRole('dialog', {
          name: 'Edit autofill rule',
          exact: true,
        });
        await expect(editor).toBeVisible();
        const box = await editor.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
        assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1);
        await page.screenshot({
          path: join(system.evidence, `autofill-editor-${size}-${mode}.png`),
          fullPage: false,
        });
        const saveRule = editor.getByRole('button', {
          name: 'Save autofill rule',
          exact: true,
        });
        await saveRule.scrollIntoViewIfNeeded();
        await expect(saveRule).toBeInViewport();
        await saveRule.focus();
        await expect(saveRule).toBeFocused();
        if (size === 'mobile')
          await page.screenshot({
            path: join(system.evidence, `autofill-actions-${size}-${mode}.png`),
            fullPage: false,
          });
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Edit', exact: true }),
        ).toBeFocused();
        await page.goto(`${system.origin}/admin/workflow`);
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle('dark', dark),
          mode === 'dark',
        );
        await page
          .getByRole('button', { name: `Edit ${status.name}`, exact: true })
          .click();
        const dialog = page.getByRole('dialog', {
          name: 'Edit status',
          exact: true,
        });
        await dialog
          .getByRole('checkbox', { name: 'Do not send email on entry' })
          .uncheck();
        const to = dialog.getByRole('textbox', {
          name: 'To addresses',
          exact: true,
        });
        const cc = dialog.getByRole('textbox', {
          name: 'CC addresses',
          exact: true,
        });
        await to.scrollIntoViewIfNeeded();
        const scroller = dialog.locator('.admin-status-dialog__content');
        const savedScroll = await scroller.evaluate((node) => node.scrollTop);
        const before = {
          to: await to.boundingBox(),
          cc: await cc.boundingBox(),
        };
        await to.fill(
          Array.from({ length: 8 }, (_, i) => `recipient${i}@nxp.com`).join(
            ';',
          ),
        );
        await dialog
          .getByRole('button', { name: 'Add To', exact: true })
          .click();
        const after = {
          to: await to.boundingBox(),
          cc: await cc.boundingBox(),
        };
        for (const field of ['to', 'cc']) {
          assert.ok(
            Math.abs(before[field].y - after[field].y) <= 1,
            `${size}/${mode}: ${field} input stays fixed (${before[field].y} -> ${after[field].y})`,
          );
        }
        await cc.fill('copy@nxp.com');
        await dialog
          .getByRole('button', { name: 'Add CC', exact: true })
          .click();
        await expect(
          dialog
            .getByRole('list', { name: 'To recipients', exact: true })
            .getByRole('listitem'),
        ).toHaveCount(8);
        await expect(
          dialog.getByRole('list', { name: 'CC recipients', exact: true }),
        ).toContainText('copy@nxp.com');
        await dialog
          .getByRole('button', {
            name: 'Remove recipient0@nxp.com from To',
            exact: true,
          })
          .click();
        await expect(
          dialog
            .getByRole('list', { name: 'To recipients', exact: true })
            .getByRole('listitem'),
        ).toHaveCount(7);
        await scroller.evaluate((node, value) => {
          node.scrollTop = value;
        }, savedScroll);
        for (const field of ['to', 'cc']) {
          const box = await (field === 'to' ? to : cc).boundingBox();
          assert.ok(
            Math.abs(before[field].y - box.y) <= 1,
            `${size}/${mode}: ${field} input stays fixed after removal`,
          );
        }
        await to.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(system.evidence, `status-recipients-${size}-${mode}.png`),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
      }
    }
  },
);
