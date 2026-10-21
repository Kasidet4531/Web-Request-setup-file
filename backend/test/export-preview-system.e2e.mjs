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

test(
  'the Export Preview scrolls across every column and pages through the file like the request list',
  { timeout: 180_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const catalog = await api(page, 'GET', '/workflow/statuses');
    const open = catalog.entries.find((entry) => entry.kind === 'open');
    assert.ok(open);
    // One more request than a page holds; the newest is first in the file.
    const requestNos = [];
    for (let n = 1; n <= 101; n++) {
      const draft = await api(page, 'POST', '/requests', {
        requesterData: {
          product_type: 'New Product',
          title: `Export preview request ${n}`,
          requester_name: 'Email E2E Admin',
          due_date: '2030-01-15',
          priority: 'High',
          product: 'E2E Product',
          wafer_fab: 'E2E FAB',
          probecard_name: 'E2E Card',
        },
      });
      const submitted = await api(
        page,
        'POST',
        `/requests/${draft.id}/submit`,
        {
          formVersion: draft.formVersion,
          expectedUpdatedAt: draft.updatedAt,
          status: open.name,
        },
      );
      requestNos.push(submitted.requestNo);
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${system.origin}/admin/export-profile`);
    const preview = page.getByRole('region', {
      name: 'Filtered request preview',
    });
    await expect(preview.locator('tbody tr')).toHaveCount(100);
    await expect(preview.locator('tbody th').first()).toHaveText(
      requestNos.at(-1),
    );

    // The table fits the window, so its sideways scrollbar is in reach; a
    // sideways wheel over it reaches the file's last column, and the page
    // itself never scrolls sideways.
    const { height } = await preview.boundingBox();
    assert.ok(height < 800, `the table is ${height}px tall`);
    await preview.evaluate((element) =>
      element.scrollIntoView({ block: 'end' }),
    );
    const lastHeader = preview.locator('thead th').last();
    await expect(lastHeader).not.toBeInViewport();
    await preview.hover();
    await page.mouse.wheel(100_000, 0);
    await expect(lastHeader).toBeInViewport();
    await expect(preview.locator('tbody th').first()).toBeInViewport();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: join(system.evidence, 'export-preview-scrolled.png'),
    });

    const pagination = page.getByLabel('Request preview pagination');
    await expect(pagination).toContainText('1–100 of 101 requests');
    // Down to the page's last row, then on to the next page from its top.
    await page.mouse.wheel(0, 100_000);
    await expect(preview.locator('tbody th').last()).toBeInViewport();
    await expect(preview.locator('thead th').first()).toBeInViewport();
    // While the next page loads, this one stays in place, back at its top.
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(
      '**/api/requests/export-preview?**',
      async (route) => {
        await held;
        await route.continue();
      },
      { times: 1 },
    );
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(pagination).toHaveAttribute('aria-busy', 'true');
    await expect(preview.locator('tbody tr')).toHaveCount(100);
    assert.equal(await preview.evaluate((element) => element.scrollTop), 0);
    release();
    await expect(pagination).toContainText('101–101 of 101 requests');
    await expect(preview.locator('tbody th')).toHaveText([requestNos[0]]);
    await expect(
      pagination.getByRole('button', { name: 'Next' }),
    ).toBeDisabled();
    await page.screenshot({
      path: join(system.evidence, 'export-preview-page-2.png'),
      fullPage: true,
    });
    await pagination.getByRole('button', { name: 'Previous' }).click();
    await expect(pagination).toContainText('1–100 of 101 requests');
    await expect(preview.locator('tbody tr')).toHaveCount(100);
  },
);
