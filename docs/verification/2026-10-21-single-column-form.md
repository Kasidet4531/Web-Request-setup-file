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
pinned action bar is issue #90, recorded in its own section below.

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

- **Form Version 2 with 42 fields**, the size spec #86 gives for the active Requester form:
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
position at the end of the form; pinning it is issue #90, recorded under
[Pinned action bar](#pinned-action-bar) below.

## Pinned action bar

Issue #90 (parent spec #86): the renderer's action area is a bar pinned to the
bottom of the viewport while its form scrolls (in the Admin preview, to the
bottom of the "Preview fields" scroll region), spanning the form card with Save
as the right-most button. Its status area, left of the buttons, shows saving,
saved and save errors of the Requester form and of PSF Created Information, and
the preview's "All required fields are complete.", instead of a notice at the
top of the card or page. Sources: the
[renderer](../../frontend/src/components/DynamicFormRenderer.tsx), the
[Requester form](../../frontend/src/components/ActiveSchemaForm.tsx),
[Request Detail and the PSF panel](../../frontend/src/components/RequestsWorkspace.tsx),
the [Admin preview](../../frontend/src/components/AdminFormConfigPreview.tsx) and
the bar styles in [`index.css`](../../frontend/src/index.css).

- Branch `feat/90-pinned-action-bar`, based on `feat/86-single-column-form` at
  `be3475d` (#87, #88 and #89 merged); captured from `598c9fa`.
- Environment as above: Node 22.22.0, Chromium 141.0.7390.37 through
  Playwright 1.58.2, headless, 1440×1000 and 390×844, light and dark; a
  throwaway PostgreSQL 16 cluster under `/tmp`, deleted afterwards; the
  compiled backend with local development identities and no `backend/.env`;
  the Vite dev server; Google Fonts answered with empty CSS. The
  configured/shared database was not used and no Draft was created on it.

### Local data and saves

- The 42-field Requester Form Version 2 as above, plus a **24-field PSF Created
  Information Form Version 2** built the same way (the seeded ten fields, then
  text, select, number and text area fields, none required). The seeded ten
  fields fit on a 1440×1000 screen, so without it the desktop PSF editor never
  scrolls and its bar never pins.
- One submitted request (PSF-000001) with every field filled and its PSF
  Created Information saved, and one Draft with its first 12 fields filled.
- Saves shown as "saved" ran against the throwaway database: a Draft save, a
  submitted request's Requester Information save and a PSF Created Information
  save. The save in progress was captured by holding the Draft save's request
  in the browser for four seconds. The save error was stubbed in the browser:
  the `PUT …/requester-data` request was answered with a 503 and never reached
  the server.

### Test results

| Check | Command | Base `be3475d` | Branch |
| --- | --- | --- | --- |
| Frontend tests | `cd frontend && npx vitest run` | 38 files, 513 passed | 38 files, 521 passed |
| Renderer tests | `npx vitest run src/components/DynamicFormRenderer.test.tsx` | 28 passed | 32 passed |
| Requester form interaction tests | `npx vitest run src/components/ActiveSchemaForm.interaction.test.tsx` | 31 passed | 34 passed |
| Request workspace tests | `npx vitest run src/components/RequestsWorkspace.test.tsx` | 105 passed | 105 passed |
| Form Management interaction tests | `npx vitest run src/components/AdminFormConfigPage.interaction.test.tsx` | 39 passed | 40 passed |
| Frontend type check | `cd frontend && npx tsc -b --force` | Passed | Passed |
| Frontend lint | `cd frontend && npx eslint .` | 1 error | the same 1 error (`GlobalHistoryPage.test.tsx:389`, `no-useless-assignment`) |
| Frontend build | `cd frontend && npx vite build` | Passed | Passed |

The backend was not changed. The renderer tests render the bar to static
markup: a saved result sits in the bar's `role="status"` element before the
buttons, which run Delete Draft, Cancel, then Save last; an error is a
`role="alert"` element there; while a save is pending on the locked form the
buttons stay, disabled; a form back in read-only keeps the result without
buttons, and a read-only form without a result has no bar. The interaction tests
show a Draft save reporting "Saving requester information…" then "Draft
DRAFT-0001 saved." in the bar and neither at the top of the card, the saved
result cleared by the next edit; a submitted request's save keeping "Requester
information saved." in the bar after the form returns to view mode, until "Edit
information"; a save error reported in the bar while the form stays editable,
and cleared by Cancel; Cancel staying, disabled, while a save runs; PSF Created
Information reporting "Saving PSF Created Information…", "PSF Created
Information for PSF-0001 saved." (cleared by "Edit information") and its save
and conflict errors in its bar, with no notice at the top of the page; and the
preview's complete check in its bar. The tests that asserted the old top-of-card
and top-of-page save notices now assert the bar.

### Browser checks

Measured with `getBoundingClientRect` and `getComputedStyle` in the running app,
with each form scrolled to its middle rows:

| Check | Desktop 1440×1000 | Mobile 390×844 |
| --- | --- | --- |
| Bar pinned while scrolled (bar bottom = viewport or region bottom) | New Request, Draft editing, submitted request editing, PSF Created Information editing and the Admin preview, light and dark | the same |
| Bar spans the card | 1px inside the card border on each side (Request Detail card 252–1408, bar 253–1407; New Request 270–1390, bar 271–1389); in the preview, the full width of the scroll region (295–1145) | card 16–374, bar 17–373; preview region and bar 42–348 |
| Save is the right-most control, at the card's right edge | every other button ends left of Save; Save ends at the bar's 24px inner padding, the card's content edge (1383 against the bar's 1407 on Request Detail), and flush with the region's edge in the preview | the same (349 against 373); the buttons share their line, Save last |
| Bar height | 65px; 45px when only a result remains after an explicit-edit save | 65px; 97px with a result line above the buttons; 117px when Cancel and "Save PSF Created Information" stack or an error wraps to two lines; 45px (65px if it wraps) with only a result |
| Last row scrolls clear of the bar | at the end of New Request the last row ends above the bar, which sits in flow and closes the card | the same |
| Keyboard focus | Tab into a control hidden behind the bar scrolls it above the bar on New Request, Draft and submitted editing and in the preview (both widths) and in PSF editing at phone width (text areas excepted: Chromium keeps only their caret line in view) | the same |
| Result roles | each result capture found its message in the bar's `role="status"` element (saving, saved, complete) or `role="alert"` element (save error) | the same |
| Result text against the bar | light: saving 5.65:1 (`--muted-foreground`), saved 7.07:1 (`--success`), error 6.51:1 (`--destructive`) | dark: 7.75:1, 8.96:1, 7.95:1 |
| Theme | bar background `--card`, top border `--border`, upward shadow `--shadow-bar` (light `#172b3a14`, dark `#0000004d`) | the same |
| Horizontal overflow | none on any capture | none on any capture |

Console: no page errors; the only console errors are the two expected "503
(Service Unavailable)" entries from the stubbed save error.

### Screenshots

Viewport captures with the form scrolled to its middle rows, so the bar is
pinned over the rows below.

| Rendering | Desktop, light | Desktop, dark | Mobile, light | Mobile, dark |
| --- | --- | --- | --- | --- |
| New Request | [desktop/light](assets/2026-10-21-single-column-form/new-request-pinned-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/new-request-pinned-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/new-request-pinned-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/new-request-pinned-mobile-dark.png) |
| Draft editing | [desktop/light](assets/2026-10-21-single-column-form/draft-edit-pinned-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/draft-edit-pinned-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/draft-edit-pinned-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/draft-edit-pinned-mobile-dark.png) |
| Submitted request editing | [desktop/light](assets/2026-10-21-single-column-form/submitted-edit-pinned-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/submitted-edit-pinned-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/submitted-edit-pinned-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/submitted-edit-pinned-mobile-dark.png) |
| PSF Created Information editing | [desktop/light](assets/2026-10-21-single-column-form/psf-edit-pinned-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/psf-edit-pinned-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/psf-edit-pinned-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/psf-edit-pinned-mobile-dark.png) |
| Admin Form Management preview | [desktop/light](assets/2026-10-21-single-column-form/admin-preview-pinned-desktop-light.png) | [desktop/dark](assets/2026-10-21-single-column-form/admin-preview-pinned-desktop-dark.png) | [mobile/light](assets/2026-10-21-single-column-form/admin-preview-pinned-mobile-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/admin-preview-pinned-mobile-dark.png) |

Results in the bar, desktop light and mobile dark:

| State | Desktop, light | Mobile, dark |
| --- | --- | --- |
| Draft save in progress (buttons disabled) | [desktop/light](assets/2026-10-21-single-column-form/draft-saving-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/draft-saving-mobile-dark.png) |
| Draft saved | [desktop/light](assets/2026-10-21-single-column-form/draft-saved-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/draft-saved-mobile-dark.png) |
| Submitted request save error (stubbed 503) | [desktop/light](assets/2026-10-21-single-column-form/submitted-save-error-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/submitted-save-error-mobile-dark.png) |
| Submitted request saved, back in view mode | [desktop/light](assets/2026-10-21-single-column-form/submitted-saved-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/submitted-saved-mobile-dark.png) |
| PSF Created Information saved, back in view mode | [desktop/light](assets/2026-10-21-single-column-form/psf-saved-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/psf-saved-mobile-dark.png) |
| Admin preview, all required fields complete | [desktop/light](assets/2026-10-21-single-column-form/admin-preview-checked-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/admin-preview-checked-mobile-dark.png) |
| End of New Request: last row clear of the bar | [desktop/light](assets/2026-10-21-single-column-form/new-request-end-desktop-light.png) | [mobile/dark](assets/2026-10-21-single-column-form/new-request-end-mobile-dark.png) |

On the desktop "PSF Created Information saved" capture the form had become
shorter (read-only text areas are lower than editable ones), so the bar sits at
the end of the form rather than pinned.

### Limits of the pinned bar checks

Chromium 141 only, at two viewports; widths between 600 and 899px and other
browsers were not captured. Status and alert announcements were checked as
roles in the DOM, not with a screen reader. The keyboard check covers Tab
navigation in Chromium, which honours `scroll-padding-bottom`. Phone captures
used a desktop browser at phone size, without an on-screen keyboard. Deployment
and the configured database were not exercised.

## Centred request column

New Request, Request Detail (Drafts and submitted requests) and Admin Draft
detail in Draft Management sit in one column at most 1335px wide, centred in the
content area: one and a half times a card around the 840px rows, chosen from a
throwaway prototype of four layouts (variant D). In that column the form rows
fill the card; the label column stays 260px. Below 1335px of content width the
column fills the content area as before. The Admin Form Management preview and
Request Snapshots keep rows at most 840px wide. Where Attachments shows under
Requester Information (a Draft, including in Draft Management) its card now
sits 16px below, as on New Request; on a submitted request, Attachments is its
own tab and keeps the tab spacing. CSS only, in
[`index.css`](../../frontend/src/index.css) (`--request-page-max-width`).

- Branch `claude/eloquent-goodall-p1sbcp`, based on `main` at `0c2ddef`; the
  prototype commits on that branch were removed before these captures.
- Environment as above, with Chromium driven at 1920×1080, 1440×1000 and
  390×844 in the light theme; a throwaway PostgreSQL 16 cluster under
  `/var/tmp`; the compiled backend with local development identities and no
  `backend/.env`; the Vite dev server. The configured/shared database was not
  used.
- Local data: the seeded ten-field Requester Form Version 1, one Draft and one
  request submitted to its first Status, created through the API.

### Test results

| Check | Command | Branch |
| --- | --- | --- |
| Frontend tests | `cd frontend && npx vitest run` | 38 files, 523 passed |
| Frontend type check | `cd frontend && npx tsc -b --force` | Passed |
| Frontend lint | `cd frontend && npx eslint .` | the same 1 error as on `main` (`GlobalHistoryPage.test.tsx:389`, `no-useless-assignment`) |
| Frontend build | `cd frontend && npx vite build` | Passed |

No test asserts layout: jsdom does not compute it, so the change was measured
in the browser.

### Browser checks

Measured with `getBoundingClientRect` on New Request, the Draft, the submitted
request and Admin Draft detail.

| Check | 1920×1080 | 1440×1000 | 390×844 |
| --- | --- | --- | --- |
| Page column | 1335px, 151px clear on each side | 1156px, fills the content area | 358px, fills the content area |
| Form rows | 1285px, the card's inner width; label column 260px | 1106px; label column 260px | 308px, label above its control |
| Attachments below Requester Information (Draft, Draft Management, New Request) | 16px | 16px | 16px |
| Submitted request: tabs to the panel, Requester Information and Attachments tabs | 16px and 16px | 16px and 16px | 16px and 16px |
| Horizontal overflow | none | none | none |

### Screenshots

| Page | Capture |
| --- | --- |
| Submitted request | [1920×1080](assets/2026-10-21-single-column-form/centred-column-request-1920.png) |
| Draft, scrolled to Attachments | [1920×1080](assets/2026-10-21-single-column-form/centred-column-draft-1920.png), [390×844](assets/2026-10-21-single-column-form/centred-column-draft-390.png) |
| New Request | [1920×1080](assets/2026-10-21-single-column-form/centred-column-new-request-1920.png) |
| Admin Draft detail (Draft Management) | [1920×1080](assets/2026-10-21-single-column-form/centred-column-admin-draft-1920.png) |

### Limits of the centred column checks

Chromium 141 only, light theme only (the change sets widths and a margin, no
colours), with the seeded ten-field form rather than a long one. Widths between
1440 and 1920 were not captured; the column stops growing at 1335px. Google
Fonts requests were answered with empty CSS, as above. Deployment and the
configured database were not exercised.
