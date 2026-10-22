import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { join } from 'node:path';
import { expect } from 'playwright/test';
import { startEmailSystem, loginPage, api } from './email-system.fixture.mjs';

// The Browser plugin has no callable browser tool in this session. Exercise
// the real built app in local Chromium and an isolated disposable PostgreSQL.
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
  'History live Search, Bangkok dates and legacy Status filtering work through the real app',
  { timeout: 60_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const draft = await api(page, 'POST', '/requests', {
      requesterData: {
        product_type: 'New Product',
        title: 'Search Filter Silicon',
        requester_name: 'Email E2E Admin',
        due_date: '2030-01-15',
        priority: 'High',
        product: 'E2E Product',
        wafer_fab: 'E2E FAB',
        probecard_name: 'E2E Card',
      },
    });
    const catalog = await api(page, 'GET', '/workflow/statuses');
    const submitted = await api(page, 'POST', `/requests/${draft.id}/submit`, {
      formVersion: draft.formVersion,
      expectedUpdatedAt: draft.updatedAt,
      status: catalog.entries.find((entry) => entry.kind === 'open').name,
    });
    const { user } = await api(page, 'GET', '/me');
    // Synthetic legacy audit entries supply pagination and exact day boundaries.
    const times = [
      '2026-10-21T16:59:59.999Z',
      '2026-10-21T17:00:00Z',
      '2026-10-22T16:59:59.999Z',
      '2026-10-22T17:00:00Z',
    ];
    for (let index = 0; index < 30; index++) {
      await system.database.query(
        `INSERT INTO psf_request_audit_logs
       (id,request_id,action_type,actor_id,actor_username,actor_display_name,actor_role,metadata_json,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'admin','{}',$7)`,
        [
          randomUUID(),
          draft.id,
          index < 4
            ? 'REQUEST_STATUS_CHANGED'
            : 'REQUESTER_INFORMATION_UPDATED',
          user.id,
          user.username,
          user.displayName,
          times[index] ?? '2026-10-01T00:00:00Z',
        ],
      );
    }
    await page.goto(`${system.origin}/history`);
    const search = page.getByRole('searchbox', { name: 'Search', exact: true });
    const rows = page.locator('.global-history-page__results .data-table > table > tbody > tr');
    const pagination = page.getByLabel('Audit history pagination');
    await expect(rows).toHaveCount(25);
    await expect(
      page.getByRole('button', { name: 'Apply', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: 'Status', exact: true }),
    ).toHaveCount(0);
    for (const keyword of [
      submitted.requestNo,
      'filter silicon',
      'Email E2E Admin',
      user.username,
    ]) {
      const response = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === '/api/audit-logs' &&
          url.searchParams.get('keyword') === keyword
        );
      });
      await search.fill(keyword);
      assert.equal((await response).status(), 200);
      await expect(rows).toHaveCount(25);
      await expect(pagination).toContainText('1–25 of 32 entries');
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pagination).toContainText('26–32 of 32 entries');
    await page
      .getByRole('combobox', { name: 'Action', exact: true })
      .selectOption('REQUEST_STATUS_CHANGED');
    await expect(rows).toHaveCount(4);
    await expect(pagination).toContainText('1–4 of 4 entries');
    await page
      .getByRole('button', { name: 'More filters', exact: true })
      .click();
    await page.getByLabel('From (Bangkok)', { exact: true }).fill('2026-10-22');
    await page.getByLabel('To (Bangkok)', { exact: true }).fill('2026-10-22');
    await expect(rows).toHaveCount(2);
    await expect(pagination).toContainText('1–2 of 2 entries');
    await expect(rows.locator('td:first-child')).toHaveText([
      '22 Oct 2026, 23:59:59',
      '22 Oct 2026, 00:00:00',
    ]);
    await page
      .getByRole('button', { name: 'More filters', exact: true })
      .click();
    await expect(
      page.getByLabel('From (Bangkok)', { exact: true }),
    ).toBeHidden();
    await expect(
      page.getByText('Dates (Bangkok):', { exact: false }),
    ).toBeVisible();

    await page.screenshot({
      path: join(system.evidence, 'history-search-light.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Switch to dark mode', exact: true })
      .click();
    await page.screenshot({
      path: join(system.evidence, 'history-search-dark.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1024, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: join(system.evidence, 'history-search-1024.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .click();
    await expect(search).toHaveValue('');
    await expect(rows).toHaveCount(25);
    await expect(pagination).toContainText('1–25 of 32 entries');

    // Model a historical imported Status without changing the active catalog.
    const legacy = 'Legacy Transfer -- pending';
    await system.database.query(
      'UPDATE psf_requests SET status=$1 WHERE id=$2',
      [legacy, draft.id],
    );
    await system.database.query(
      'UPDATE psf_request_search_index SET status=$1 WHERE request_id=$2',
      [legacy, draft.id],
    );
    await page.goto(`${system.origin}/dashboard`);
    const status = page.getByRole('combobox', { name: 'Status', exact: true });
    await expect(status.locator('option', { hasText: legacy })).toHaveCount(1);
    const keywordResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/requests' &&
        url.searchParams.get('keyword') === 'Filter Silicon'
      );
    });
    await page
      .getByRole('textbox', { name: 'Search', exact: true })
      .fill('Filter Silicon');
    await keywordResponse;
    await expect(
      page.getByText('No requests match these filters', { exact: true }),
    ).toBeVisible();
    const dashboardResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/requests' &&
        url.searchParams.get('status') === legacy
      );
    });
    await status.selectOption(legacy);
    const response = await dashboardResponse;
    assert.equal(new URL(response.url()).searchParams.get('workState'), 'all');
    assert.equal(
      new URL(response.url()).searchParams.get('keyword'),
      'Filter Silicon',
    );
    await expect(page.locator('.request-results tbody tr')).toHaveCount(1);
    await expect(
      page.locator('.summary-card[aria-pressed="true"]'),
    ).toHaveCount(0);
    await page.screenshot({
      path: join(system.evidence, 'dashboard-legacy-status.png'),
      fullPage: true,
    });
    await page.goto(`${system.origin}/requests`);
    await page
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption(legacy);
    await expect(page.locator('.request-results tbody tr')).toHaveCount(1);
    await expect(
      page.getByText(
        'Searches request no., product description, reference PSF name, PSF setup file name and probecard name.',
        { exact: true },
      ),
    ).toBeVisible();
    system.assertHealthy();
  },
);
