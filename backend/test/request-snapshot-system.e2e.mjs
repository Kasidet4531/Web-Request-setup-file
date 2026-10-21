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
    await api(page, 'POST', `/requests/${draft.id}/submit`, {
      formVersion: draft.formVersion,
      expectedUpdatedAt: draft.updatedAt,
      status: target.name,
    });
    await page.goto(`${system.origin}/requests/${draft.id}`);
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    const editButton = page.getByRole('button', {
      name: 'Edit information',
      exact: true,
    });
    const saveRequesterInformation = async () => {
      await page
        .getByRole('button', {
          name: 'Save information',
          exact: true,
        })
        .click();
      await expect(editButton).toBeVisible();
    };
    await tab('Requester Information').click();
    await editButton.click();
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('Renamed for snapshot');
    await saveRequesterInformation();

    // The new entry is there without reloading the page.
    await tab('History').click();
    const links = page.getByRole('link', {
      name: 'View Request Snapshot',
      exact: true,
    });
    // Created, submitted and edited: one Request Snapshot each.
    await expect(links).toHaveCount(3);

    // A save that changes nothing succeeds and adds no entry.
    await tab('Requester Information').click();
    await editButton.click();
    await saveRequesterInformation();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await tab('History').click();
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
    const requester = page.locator('#request-snapshot-requester');
    await expect(
      requester.getByText('Renamed for snapshot', { exact: true }),
    ).toBeVisible();
    // Identity fields of the Form Schema are part of the form.
    await expect(
      requester.getByText('Requester Name', { exact: true }),
    ).toBeVisible();
    // Only the edited field is marked, with its value before the update.
    const edited = page.locator('.request-snapshot__row--changed');
    await expect(edited).toHaveCount(1);
    await expect(edited).toContainText('Changed in this update');
    await expect(edited).toContainText('Before this update');
    await expect(edited).toContainText('Snapshot system request');
    await expect(page.getByText(/^Previous: /)).toHaveCount(0);
    await expect(page.getByText(/current request/i)).toHaveCount(0);
    // The summary link moves the reader to the edited field.
    await page
      .getByRole('navigation', { name: 'Changes in this update' })
      .getByRole('link', { name: 'Title' })
      .click();
    await expect(edited).toBeFocused();
    await expect(
      page
        .getByRole('navigation', { name: 'Breadcrumbs' })
        .getByRole('link', { name: 'Request History', exact: true }),
    ).toHaveAttribute('href', `/requests/${draft.id}/history`);
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: 'Request History', exact: true }),
    ).toHaveAttribute('href', `/requests/${draft.id}/history`);
    await page.screenshot({
      path: join(system.evidence, 'request-snapshot-page.png'),
      fullPage: true,
    });

    // The entry before the edit still shows the content of its own time.
    await page.goto(`${system.origin}/history`);
    await page
      .getByRole('link', { name: 'View Request Snapshot', exact: true })
      .nth(1)
      .click();
    await expect(page.getByText(/^Request submitted · By /)).toBeVisible();
    // Submitting moved the request out of Draft.
    await expect(page.locator('#request-snapshot-status dd')).toHaveText([
      'Draft',
      target.name,
    ]);
    await expect(
      page.getByText('Snapshot system request', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Renamed for snapshot')).toHaveCount(0);
  },
);
