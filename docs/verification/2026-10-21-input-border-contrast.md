# Input border contrast verification — 21 October 2026

## Change and environment

Issue #87 (parent spec #86): in the light theme, the `--input-border` token in
[`frontend/src/index.css`](../../frontend/src/index.css) changes from `#a7adaa`
to `#858b88`. The new value keeps the same grey-green hue (HSL 150°) and is
darker, so text inputs, selects and text areas meet WCAG 2.1 SC 1.4.11 (3:1 for
user interface components) against both the card and the page background. The
dark theme token (`#858b8b`) is unchanged. No other CSS rule, component or
layout changed.

- Branch `feat/87-input-border-contrast`, based on `feat/86-single-column-form`
  at `45ce2e5`.
- Node 22.22.0. Browser: Chromium 141.0.7390.37 (`/opt/pw-browsers/chromium`),
  driven by Playwright 1.58.2 from `backend/node_modules`, headless, at a
  1440×1000 viewport.
- Database: a throwaway PostgreSQL 16 cluster under `/tmp`, created for the run
  and deleted afterwards. The configured/shared database was not used, and no
  Draft was created anywhere: New Request was only opened, the Admin form
  preview saves nothing, and the Dashboard check only reads.
- Backend: the compiled backend from this branch, started from an empty
  directory with an explicit environment (no `backend/.env`), with local
  development identities (`requester`, `admin`; see
  [local development auth](../local-development-auth.md)). Frontend: the Vite
  dev server from this branch. Company LDAP and SOAP were not contacted.
- The default Form Version 1 seed was used. Google Fonts requests were answered
  with empty CSS, so the screenshots use fallback fonts.

## Test results

| Check | Command | Result |
| --- | --- | --- |
| Frontend tests | `cd frontend && npx vitest run` | 38 files, 505 tests passed (same as the base) |
| Frontend type check | `cd frontend && npx tsc -b --force` | Passed |
| Frontend lint | `cd frontend && npx eslint .` | 1 error, present on the base: `GlobalHistoryPage.test.tsx:389` `no-useless-assignment` |

The backend was not changed. Spec #86 lists border contrast as verified in a
real browser rather than by unit tests, so no unit test was added. The
before-and-after browser measurements below are the check.

## Measured contrast

Colours were read with `getComputedStyle` in the running app, then the WCAG 2.x
contrast ratio was computed from them. "Before" is the base commit; "after" is
this branch.

| Theme | Pair | Before | After |
| --- | --- | --- | --- |
| Light | Input border vs card `#ffffff` | `#a7adaa`: 2.28:1 | `#858b88`: **3.47:1** |
| Light | Input border vs page background `#f6f5f2` | `#a7adaa`: 2.09:1 | `#858b88`: **3.19:1** |
| Dark | Input border `#858b8b` vs card `#242629` | 4.38:1 | 4.38:1 (unchanged) |
| Dark | Input border `#858b8b` vs page background `#181a1c` | 5.04:1 | 5.04:1 (unchanged) |

The same value was measured on a text input, a date input, a select, a text
area, a Product Type radio option and a secondary button on New Request, in
both themes.

Field states, measured after the change (Admin form preview after "Check
required fields", with Reference PSF Name focused):

| State | Light | Dark |
| --- | --- | --- |
| Normal border | `#858b88`, 3.47:1 vs card | `#858b8b`, 4.38:1 vs card |
| Invalid border (`aria-invalid`) | `#b42332`, 6.51:1 vs card, red and paired with an error message | `#ffa2ab`, 7.95:1 vs card, paired with an error message |
| Focused (`:focus-visible`) | 2px solid `#005775` outline, offset 2px, 8.01:1 vs card | 2px solid `#a0e4f5` outline, offset 2px, 10.77:1 vs card |
| Disabled (Dashboard Status filter while its options load) | `#f4f4f0` fill, muted `#62686c` text, `not-allowed` cursor; border 3.15:1 vs its own fill | `#303335` fill, muted `#b7bab8` text, `not-allowed` cursor; border 3.67:1 vs its own fill |

The invalid border differs from the normal border in hue (red against grey) and
comes with an error message. The focus ring is a separate outline outside the
border, so the darker border does not affect it. Disabled controls keep their
own fill, muted text and cursor, so they still read as disabled next to enabled
ones. The radio options' own borders stay grey when the group is invalid. That
behaviour is not new; the group's error message marks it.

## Other elements that share the token

`--input-border` is also used outside form controls, so these elements now have
the darker light-theme border too (dark theme unchanged):

- the border of every secondary button (`.ui-button`, `.btn-secondary`,
  `.secondary-button` and the Form Management control buttons), 3.47:1 against
  the card;
- the Product Type and other radio option outlines (`.dynamic-form__radio-option`);
- dialog borders (`.ui-dialog` and the Form Management field and preview dialogs,
  user dialog);
- the Draft form-version upgrade box (`.draft-schema-upgrade`) and the Form
  Management view banner's left bar, both on the page background (3.19:1);
- History timeline dots (`.request-history__timeline`);
- the Form Management editor head buttons (`ux-polish.css`).

These were left on the shared token on purpose: spec #86 asks for the input
border token itself to be darkened, and each of these elements is a control or
boundary that benefits from the same contrast. The secondary buttons, radio
options and preview dialog appear in the screenshots below.

## Screenshots

All are 1440×1000 viewport captures from the run above.

- [New Request before the change, desktop/light](assets/2026-10-21-input-border-contrast/new-request-desktop-light-before.png)
- [New Request, desktop/light](assets/2026-10-21-input-border-contrast/new-request-desktop-light.png)
- [New Request, desktop/dark](assets/2026-10-21-input-border-contrast/new-request-desktop-dark.png)
- [Normal, invalid and focused fields in the Admin form preview, desktop/light](assets/2026-10-21-input-border-contrast/field-states-desktop-light.png)
- [Normal, invalid and focused fields in the Admin form preview, desktop/dark](assets/2026-10-21-input-border-contrast/field-states-desktop-dark.png)
- [Enabled Keyword input next to the disabled Status filter, desktop/light](assets/2026-10-21-input-border-contrast/disabled-filter-desktop-light.png)
- [Enabled Keyword input next to the disabled Status filter, desktop/dark](assets/2026-10-21-input-border-contrast/disabled-filter-desktop-dark.png)

The disabled-filter captures hold the Dashboard's status-catalog request open,
so the Status select stays in its loading (disabled) state. The Clear filters
button beside it is also disabled, as it is whenever no filter is active.

The form layout in these captures is the two-column layout of the base; the
single-column rows of #88 are a separate change.

## Limits

These checks cover Chromium 141 at a desktop viewport, on a throwaway local
database, with the default Form Version 1. They do not cover other browsers,
Windows high-contrast or forced-colours modes, the production Form Version,
deployment, or the configured database. Contrast was measured on the computed
token colours; anti-aliasing of a 1px border on screen is not measured.
