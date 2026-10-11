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
  'a saved change opens from History as a Request Snapshot of that time',
  { timeout: 60_000 },
  async (t) => {
    const page = await loginPage(system, t);
    const draft = await api(page, 'POST', '/requests', {
      requesterData: {
        product_type: 'New Product',
        title: 'Snapshot system request',
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
    const submitted = await api(page, 'POST', `/requests/${draft.id}/submit`, {
      formVersion: draft.formVersion,
      expectedUpdatedAt: draft.updatedAt,
      status: target.name,
    });
    await api(page, 'PUT', `/requests/${draft.id}/requester-data`, {
      formVersion: submitted.formVersion,
      expectedUpdatedAt: submitted.updatedAt,
      requesterData: {
        ...submitted.requesterData,
        title: 'Renamed for snapshot',
      },
    });

    await page.goto(`${system.origin}/requests/${draft.id}`);
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    const links = page.getByRole('link', {
      name: 'View snapshot',
      exact: true,
    });
    // Created, submitted and edited: one Request Snapshot each.
    await expect(links).toHaveCount(3);
    await page.screenshot({
      path: join(system.evidence, 'request-snapshot-history.png'),
      fullPage: true,
    });

    await links.last().click();
    await expect(page).toHaveURL(
      new RegExp(`/requests/${draft.id}/history/[0-9a-f-]{36}$`),
    );
    await expect(
      page.getByRole('heading', { name: 'Request Snapshot', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Renamed for snapshot', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Previous: /)).toHaveText([
      'Previous: Snapshot system request',
    ]);
    await expect(
      page
        .getByRole('navigation', { name: 'Breadcrumbs' })
        .getByRole('link', { name: 'Request History', exact: true }),
    ).toHaveAttribute('href', `/requests/${draft.id}/history`);
    await page.screenshot({
      path: join(system.evidence, 'request-snapshot-page.png'),
      fullPage: true,
    });

    // The entry before the edit still shows the content of its own time.
    await page.goto(`${system.origin}/history`);
    await page
      .getByRole('link', { name: 'View snapshot', exact: true })
      .nth(1)
      .click();
    await expect(
      page.getByRole('heading', { name: 'Request submitted', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Snapshot system request', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Renamed for snapshot')).toHaveCount(0);
  },
);
