# Autofill highlight and Select all verification — 24 October 2026

## Change and environment

Issue #114 (parent spec #111, plan items 16 and 29):

- The Requester form colours a field Autofill filled (blue row, "Auto-filled" badge) and a
  field the Requester edits afterwards (orange row, "Edited by user" badge). The highlight
  rules are in [`autofillHighlight.ts`](../../frontend/src/components/autofillHighlight.ts),
  the row class in [`DynamicFormRenderer.tsx`](../../frontend/src/components/DynamicFormRenderer.tsx)
  and the colour tokens in [`index.css`](../../frontend/src/index.css). A Draft save no
  longer clears the highlight, and New Request's first save hands it in memory to the Draft
  page it opens (first load only); any other load of a request starts plain.
- Auto-fill Rules' Fill target fields gain Select all, Clear all and "N of M fields selected".

Environment: branch `impl/114` with the integration branch merged at `b705b25`; Node 22.22.0;
Chromium from `/opt/pw-browsers/chromium` driven by Playwright from `backend/node_modules`,
headless. Browser checks used the `email-system` fixture (embedded PostgreSQL created for the
run and deleted afterwards, compiled backend and built frontend of this branch, offline
mail). No configured database, NAS share or deployment was used, and no mail was sent.

## Automated tests

| Check | Command | Result |
| --- | --- | --- |
| Frontend tests | `cd frontend && npx vitest run` | 39 files, 560 tests passed |
| Frontend type check and lint | `npx tsc -b`, `npx eslint .` | Passed |
| Backend unit tests | `cd backend && npx jest` | 51 suites, 787 tests passed |
| Backend API e2e | `npm run test:e2e` | 20 passed, 1 failed: `exposes ordered workflow statuses…`, which also fails on the base (it expects no `filterStatuses`) |
| PGlite lifecycle suites | `node --require ts-node/register --test test/*.postgres.test.ts` | 116 passed, 1 skipped |
| Auto-fill Rules browser suite | `node --test test/email-system.admin-dialogs.e2e.mjs` | 2 passed |

New component tests: the renderer colours an auto-filled row and an edited row differently,
beside their labels, editable and read-only, and leaves other rows plain
(`DynamicFormRenderer.test.tsx`); after Autofill the form shows both colours, a Draft save on
the open page keeps them and sends only the field values, a remount with the saved values shows
no colour or label, and a later Autofill run recolours only the fields it fills
(`ActiveSchemaForm.autofill.interaction.test.tsx`); Select all ticks every field but the
trigger, Clear all unticks them, the count follows, and the saved rule equals the one ticked by
hand, including after a refused save (`AdminAutofillRulesPage.interaction.test.tsx`).

## Running app

A scratch Playwright script (not committed) created a completed source request and an Active
rule from Reference PSF Name to Product, Wafer FAB, Probecard Name and Request Note, then opened
a Draft:

| Step | Result |
| --- | --- |
| Type `REF-HL-1` in Reference PSF Name | Product, Wafer FAB, Probecard Name and Request Note rows show `dynamic-form__row--auto-filled` and "Auto-filled"; Title and Reference PSF Name stay plain |
| Change Wafer FAB | Wafer FAB shows `dynamic-form__row--edited-by-user` and "Edited by user"; the others unchanged |
| Save draft changes | "Draft … saved."; every row keeps the same colour and label |
| Read `psf_requests.requester_data_json` and the request's Audit History metadata | Field values only; no highlight state |
| Reload the page | Saved values shown; no row coloured, no badge |

The script's after-hook reported two 503 responses from `GET /api/requests/:id/attachments`
because the fixture configures no attachment storage; the same 503 already fails browser
suites on the base.

## Measured contrast

Colours were read with `getComputedStyle` from rows rendered with the app stylesheet, light
theme and `.dark`, and the WCAG 2.x ratio computed from them.

| Pair | Light, Auto-filled | Light, Edited | Dark, Auto-filled | Dark, Edited |
| --- | --- | --- | --- | --- |
| Row tint | `#eef4fd` | `#fff2df` | `#233350` | `#362b1f` |
| Label and read-only value text vs tint | 13.42:1 | 13.44:1 | 11.38:1 | 12.42:1 |
| Badge text vs badge | 7.72:1 | 7.04:1 | 10.14:1 | 11.03:1 |
| Row outline vs card | 7.72:1 | 7.04:1 | 8.81:1 | 9.59:1 |
| Row outline vs tint | 6.99:1 | 6.38:1 | 7.35:1 | 8.72:1 |
| Control border vs tint | 3.14:1 | 3.15:1 | 3.65:1 | 3.98:1 |
| Focus ring (2px `--ring`) vs tint | 7.25:1 | 7.26:1 | 8.98:1 | 9.80:1 |
| Field error text vs tint | 5.89:1 | 5.89:1 | 6.63:1 | 7.23:1 |

Controls keep their own background, so the text inside them keeps its usual contrast
(14.84:1 light, 13.65:1 dark). Labels and controls of highlighted rows start at the same x as
plain rows, and at 375px wide the page has no horizontal scroll. The Auto-fill Rules count text
measures 5.65:1 (light) and 7.75:1 (dark) against the dialog.

### New Request first save

Added after review: a second scratch script (not committed) opened New Request, typed a Title
and `REF-HL-2` in Reference PSF Name (Product, Wafer FAB and Probecard Name auto-filled), changed
Wafer FAB and pressed Save draft request.

| Step | Result |
| --- | --- |
| Redirect to the new Draft's page | Product and Probecard Name Auto-filled, Wafer FAB Edited by user, Title plain: the same as on New Request |
| `window.history.state` on the Draft page | Router keys only; no highlight |
| Reload the page | Saved values; every row plain |
| Open the Dashboard, then the Draft again | Saved values; every row plain |

Component tests cover the same: New Request hands the form's latest highlights over only when it
redirects (`RequestsWorkspace.test.tsx`), and the Draft form shows them on its first load only,
never for another request (`ActiveSchemaForm.autofill.interaction.test.tsx`).

## Not checked

No screen reader was used; the badges are the existing `role="status"` labels referenced by
each control's `aria-describedby`.
