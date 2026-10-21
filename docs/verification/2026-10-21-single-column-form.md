# Single-column form verification — 21 October 2026

## Change and environment

Issue #88 (parent spec #86): the dynamic form renderer
([`DynamicFormRenderer.tsx`](../../frontend/src/components/DynamicFormRenderer.tsx),
row styles in [`index.css`](../../frontend/src/index.css)) lays out every Form
Schema as one row per field, label on the left and control or stored value on
the right, instead of the two-column grid. All seven renderings go through it:
New Request, Draft and submitted request editing, PSF Created Information
(viewing and editing), the Admin Form Management preview, a request's read-only
detail, Admin Draft detail in Draft Management, and Request Snapshots in Audit
History. The Form Schema, the action area and its behaviour are unchanged; the
pinned action bar is issue #90, which will add its screenshots to this record.

- Branch `feat/88-single-column-rows`, based on `feat/86-single-column-form`
  (`45ce2e5`, then `e635495` with #87 merged in before the final capture).
- Node 22.22.0. Browser: Chromium 141.0.7390.37 (`/opt/pw-browsers/chromium`),
  driven by Playwright 1.58.2 from `backend/node_modules`, headless, at
  1440×1000 (desktop) and 390×844 (mobile) viewports, light and dark themes.
- Database: a throwaway PostgreSQL 16 cluster under `/tmp`, created for the run
  and deleted afterwards. The configured/shared database was not used; every
  Draft, submission and save below happened only in that throwaway cluster.
- Backend: the compiled backend from this branch, started from an empty
  directory with an explicit environment (no `backend/.env`), with local
  development identities `requester`, `setup_owner_gntc` and `admin` (see
  [local development auth](../local-development-auth.md)). Frontend: the Vite dev
  server from this branch. Company LDAP and SOAP were not contacted. Google
  Fonts requests were answered with empty CSS, so the captures use fallback fonts.

### Local data

- **Form Version 2 with 42 fields**, like the active production Requester form:
  as Admin, through the API, the seeded Version 1 was duplicated, its first field
  relabelled "Request To" with four long options, padded to 42 fields cycling
  text, number, date, select, text and text area (every seventh required), and
  published. Requester Name is header metadata, so 41 rows show.
- **One submitted request** (PSF-000001): created with every field filled,
  submitted to the first open Status, then its Requester Information edited
  once (Title, Priority and one text area), so its latest Request Snapshot has
  three changed fields. A Setup File Owner (GNTC) saved its PSF Created
  Information.
- **One Draft** with its first 12 fields filled, viewed by its creator (Draft
  editing) and by an Admin (Draft Management detail).

## Test results

| Check | Command | Base `e635495` | Branch |
| --- | --- | --- | --- |
| Frontend tests | `cd frontend && npx vitest run` | 38 files, 505 passed | 38 files, 509 passed |
| Renderer tests | `npx vitest run src/components/DynamicFormRenderer.test.tsx` | 24 passed | 28 passed |
| Frontend type check | `cd frontend && npx tsc -b --force` | Passed | Passed |
| Frontend lint | `cd frontend && npx eslint .` | 1 error | the same 1 error (`GlobalHistoryPage.test.tsx:389`, `no-useless-assignment`) |
| Frontend build | `cd frontend && npx vite build` | Passed | Passed |

The backend was not changed. The renderer tests render to static markup and
cover editable and read-only rows for text, number, date, select, radio and text
area fields: one row per field holding its label and its control or value,
labels associated with their controls (`for`/`id`, `aria-labelledby` on read-only
values), the radio group as `role="radiogroup"` named by its row's label cell
with required, invalid and described-by state, the required marker and error
inside the field's row and on its control, and Auto-fill status and "Previous"
values inside their row. Two older tests that asserted the removed layout (the
`fieldset` radio group and the full-width Product Type and text area) were
rewritten to the new contract.

## Browser checks

Measured with `getBoundingClientRect` and `getComputedStyle` in the running app,
on the submitted request's Requester Information, first read-only, then after
"Edit information":

| Check | Desktop 1440×1000 | Mobile 390×844 |
| --- | --- | --- |
| Rows | 41, in the configured field order | 41, in the configured field order |
| Layout | label column 260px wide at the same x for every row, controls 24px to its right; rows 840px wide on New Request | label above its control in every row (label bottom ≤ control top), both starting at the same x in a 308px column |
| Ordinary rows (text, number, date, select: 33) | 49px read-only and 49px editing, all 33 | 81–82px read-only and editing, each row unchanged, all 33 |
| Rows that grow while editing | Request To radio 49→201px (four long options wrap one per line); text areas 49–69→109px | Request To 102→286px; text areas 81–102→133–134px |
| Label style, read-only and editing | 14px/20px, weight 700, `--foreground` | the same |
| Horizontal overflow | none on any capture | none on any capture |

Before the date fix in this branch, the six date rows grew from 49 to 51px when
editing on desktop, because Chromium draws a date input 2px taller than the
other controls; date inputs in rows are now held to the 36px control line. On
screens up to 899px wide, controls are 44px tall, so labels and read-only values
move to that line too, which is why read-only rows are taller on the phone.

Accessible names, through Playwright role queries on the editable form (both
viewports): the Request To radio group is found as a `radiogroup` named
"Request To", Title as a `textbox` named "Title" and Priority as a `combobox`
named "Priority"; no radio group lacks a name and no text input, select or text
area lacks a label. The rows are not reordered with CSS, so tab order follows
the configured field order.

Console: no browser console errors or page errors in any capture.

## Screenshots

Viewport captures; detail pages are scrolled so the form's card header is just
below the app header. Read-only and editing captures of the same request are
taken at the same scroll position, so their rows can be compared directly.

| Rendering | Desktop, light | Desktop, dark | Mobile, light | Mobile, dark |
| --- | --- | --- | --- | --- |
| New Request | [desktop/light](assets/2026-10-21-single-column-form/new-request-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/new-request-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/new-request-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/new-request-mobile-dark.png) |
| Draft editing | [desktop/light](assets/2026-10-21-single-column-form/draft-edit-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/draft-edit-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/draft-edit-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/draft-edit-mobile-dark.png) |
| Submitted request editing | [desktop/light](assets/2026-10-21-single-column-form/submitted-edit-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/submitted-edit-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/submitted-edit-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/submitted-edit-mobile-dark.png) |
| Request read-only detail | [desktop/light](assets/2026-10-21-single-column-form/request-readonly-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/request-readonly-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/request-readonly-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/request-readonly-mobile-dark.png) |
| PSF Created Information, viewing | [desktop/light](assets/2026-10-21-single-column-form/psf-view-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/psf-view-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/psf-view-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/psf-view-mobile-dark.png) |
| PSF Created Information, editing | [desktop/light](assets/2026-10-21-single-column-form/psf-edit-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/psf-edit-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/psf-edit-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/psf-edit-mobile-dark.png) |
| Admin Form Management preview | [desktop/light](assets/2026-10-21-single-column-form/admin-preview-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/admin-preview-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/admin-preview-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/admin-preview-mobile-dark.png) |
| Admin Draft detail (Draft Management) | [desktop/light](assets/2026-10-21-single-column-form/admin-draft-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/admin-draft-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/admin-draft-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/admin-draft-mobile-dark.png) |
| Request Snapshot (Audit History) | [desktop/light](assets/2026-10-21-single-column-form/snapshot-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/snapshot-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/snapshot-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/snapshot-mobile-dark.png) |

The Request Snapshot captures show the three changed rows tinted, with their
"Previous" values inside the row.

## Limits

These checks cover Chromium 141 at two viewports, on a throwaway local database,
with a locally built 42-field Form Version rather than the production one. They
do not cover other browsers, widths between 600 and 899px (the label column
stays beside the control there), a real screen reader (accessible names were
read through Chromium's accessibility tree via Playwright), deployment, or the
configured database. The Admin preview dialog collapses its rows by viewport
width, not by the dialog's own width. The action area keeps its existing
position at the end of the form; pinning it is issue #90.
