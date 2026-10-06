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

// Hold a real API request until the pending UI is checked. The backend and
// database still provide the response; no application responses are mocked.
async function holdNextRequest(page, pattern) {
  let release, arrived;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const reached = new Promise((resolve) => {
    arrived = resolve;
  });
  const timer = setTimeout(release, 10_000);
  const handler = async (route) => {
    arrived();
    await gate;
    await route.continue();
  };
  await page.route(pattern, handler, { times: 1 });
  return {
    reached,
    async close() {
      clearTimeout(timer);
      release();
      await page.unroute(pattern, handler);
    },
  };
}

test(
  'loaded dashboard, request lists and audit history stay in place during slow refreshes',
  { timeout: 60_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const draft = await api(page, 'POST', '/requests', {
      requesterData: {
        product_type: 'New Product',
        title: 'Loading regression request',
        requester_name: 'Email E2E Admin',
        due_date: '2030-01-15',
        priority: 'High',
        product: 'E2E Product',
        wafer_fab: 'E2E FAB',
        probecard_name: 'E2E Card',
      },
    });
    const catalog = await api(page, 'GET', '/workflow/statuses');
    const target = catalog.entries.find((entry) => entry.kind === 'open');
    assert.ok(target);
    const submitted = await api(page, 'POST', `/requests/${draft.id}/submit`, {
      formVersion: draft.formVersion,
      expectedUpdatedAt: draft.updatedAt,
      status: target.name,
    });
    const completed = catalog.entries.find(
      (entry) => entry.kind === 'completed',
    );
    assert.ok(completed);

    await page.goto(`${system.origin}/dashboard`);
    await expect(
      page.getByText(submitted.requesterData.title, { exact: true }),
    ).toBeVisible();
    const workspace = page.locator('.dashboard-workspace');
    const top = (await workspace.boundingBox()).y;
    await expect(page.locator('.summary-card strong')).toHaveText([
      '1',
      '0',
      '0',
    ]);
    let held = await holdNextRequest(page, '**/api/requests?**');
    try {
      await page
        .getByRole('combobox', { name: /^Status/ })
        .selectOption(completed.name);
      await held.reached;
      await expect(
        page.getByText('Updating dashboard queue…', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.summary-card strong')).toHaveText([
        '1',
        '0',
        '0',
      ]);
      await expect(
        page.getByText(submitted.requesterData.title, { exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel('Dashboard pagination')).toBeVisible();
      assert.ok(
        Math.abs((await workspace.boundingBox()).y - top) < 1,
        'Refreshing must not move the dashboard workspace',
      );
      await page.screenshot({
        path: join(system.evidence, 'dashboard-refresh-desktop.png'),
        fullPage: true,
      });
    } finally {
      await held.close();
    }
    await expect(
      page.getByText('Updating dashboard queue…', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(submitted.requesterData.title, { exact: true }),
    ).toHaveCount(0);

    // The same results component serves Requests and My Drafts. Check both scopes,
    // including mobile, so preserving rows cannot accidentally expose other scopes.
    for (const scope of ['requests', 'my-drafts']) {
      if (scope === 'my-drafts')
        await api(page, 'POST', '/requests', {
          requesterData: { title: 'Private loading draft' },
        });
      await page.setViewportSize({
        width: scope === 'my-drafts' ? 390 : 1440,
        height: 1000,
      });
      await page.goto(`${system.origin}/${scope}`);
      await expect(page.locator('.request-results tbody tr')).toHaveCount(1);
      if (scope === 'my-drafts')
        await page.getByText('Filters', { exact: true }).click();
      const results = page.locator('.request-results');
      const resultsTop = (await results.boundingBox()).y;
      held = await holdNextRequest(page, '**/api/requests?**');
      try {
        await page
          .getByLabel('Keyword', { exact: true })
          .fill('does-not-match-any-request');
        await held.reached;
        await expect(results.locator('tbody tr')).toHaveCount(1);
        await expect(results).toHaveAttribute('inert', '');
        await expect(page.getByLabel('Request list pagination')).toBeVisible();
        assert.ok(
          Math.abs((await results.boundingBox()).y - resultsTop) < 1,
          `${scope} results must stay in place`,
        );
        await page.screenshot({
          path: join(system.evidence, `${scope}-refresh.png`),
          fullPage: true,
        });
      } finally {
        await held.close();
      }
      await expect(results.locator('tbody tr')).toHaveCount(0);
      await expect(
        page.getByText('Updating PSF requests…', { exact: true }),
      ).toHaveCount(0);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${system.origin}/history`);
    const history = page.getByRole('region', {
      name: 'Global audit history',
      exact: true,
    });
    await expect(history).toBeVisible();
    const rows = await history.locator('tbody tr').count();
    assert.ok(rows > 0);
    held = await holdNextRequest(page, '**/api/audit-logs?**');
    try {
      await page
        .getByLabel('User', { exact: true })
        .fill('does-not-match-any-actor');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await held.reached;
      await expect(
        page.getByText('Updating global audit history…', { exact: true }),
      ).toBeVisible();
      await expect(history.locator('tbody tr')).toHaveCount(rows);
      await expect(history).toHaveAttribute('aria-busy', 'true');
      await expect(history).toHaveAttribute('inert', '');
      await page.screenshot({
        path: join(system.evidence, 'history-refresh.png'),
        fullPage: true,
      });
    } finally {
      await held.close();
    }
    await expect(history).toHaveCount(0);
    await expect(
      page.getByText('No global audit history matches the current filters.', {
        exact: true,
      }),
    ).toBeVisible();
  },
);
