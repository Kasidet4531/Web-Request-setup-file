# Request Snapshot reading prototype

Status: development-only design preview, 21 October 2026. The user selected layout A and then asked to remove comparison with the current request. The preview now contains A only. Production still uses the existing view.

## Selected reading task

Read the complete form as it stood immediately after a selected Audit History update. Layout A follows Request Detail: a centred column, separate form panels, and labels on the left with values on the right. Every field appears in schema order, including schema-defined identity metadata. Long text, blank values and access restrictions remain visible as appropriate.

[Research input](2026-10-21-request-snapshot-readability-research.md) informed the options. Layout B used labels above values and a contents rail; it was explored and removed after the user chose A. Current-request comparison was also explored, then removed at the user's request.

## What remains in A

- Orange backgrounds, a one-pixel outline, an icon and the label "Changed in this update" mark edited fields. The change summary links to each affected field or Work Status.
- The main values belong to the selected historical update. Edited fields also show their earlier value under "Before this update".
- A Status-change update shows the complete stored Status before and after the update. A Status-only update does not mark form fields as edited.
- The recorded time includes ICT (UTC+7), with the action, actor, form versions and read-only label nearby.
- The synthetic preview offers a form-edit example and a Status-change example.

The current-request button, comparison columns, blue difference markers, comparison state and on-demand current-request fetch have been removed. There is no layout switcher. Normal History navigation retains its existing request reads.

Published schemas, historical values and access rules are unchanged. The portable sample uses generic Status names; the in-app example uses the full project Status strings.

## Open the synthetic preview

From `frontend`, run `npm run prototype:snapshot`, then open one of these URLs on the machine running Vite:

- A: `http://localhost:5174/requests/prototype/history/entry-1?variant=A`
- Status-change example: `http://localhost:5174/requests/prototype/history/status-1?variant=A`
- Existing presentation with the same sample: `http://localhost:5174/requests/prototype/history/entry-1`

Remote users need a supported forwarded URL. This chat has no port-forwarding tool, so the execution machine's localhost URL is not a user-accessible preview. Existing development links with `variant=B` resolve to A.

The preview uses a synthetic account and sample data. It handles all `/api` traffic locally and refuses writes. Normal development auth and data fetching are unchanged. Other sample-app navigation is outside this preview.

On an authenticated development server, append `?variant=A` to an accessible Request Snapshot URL. The preview is gated by `import.meta.env.DEV`; production builds use the existing view.

The archived [portable sample, screenshots and cloud handoff notes](../prototypes/request-snapshot-a/README.md) are retained with the prototype so another cloud session can retrieve them. The portable sample contains no project branding, real records, API connection or external assets. Download its `index.html` and open it locally. GitHub displays the source rather than hosting this preview as a website.

## Colour and copy

References: [project palette](../../.stitch/DESIGN.md), [form UX/accessibility guidance](2026-10-20-form-ux-accessibility-research.md#หลักการใช้สีและการเข้าถึง-color-accessibility) and [input-contrast verification](../verification/2026-10-21-input-border-contrast.md). The older research document's citation caveat remains relevant; these changes do not depend on its unverified quotations.

The earlier Chromium review at 1440×1100, with the system font fallback, measured the following pairs. A retains these event colours. These measurements are not a full WCAG audit.

| Pair | Light | Dark |
| --- | --- | --- |
| Event badge text/background | 7.04:1 | 11.03:1 |
| Earlier value / event background | 6.37:1 | 8.71:1 |
| Event outline / event background | 6.37:1 | 8.71:1 |

Earlier browser checks covered both explored layouts and comparison behaviour before their removal. They do not establish verification of the final A-only preview. Direct `file://` navigation is blocked by this environment's browser policy; previous portable-preview checks used an internal HTTP origin.

At the user's request, copy was edited with [Humanizer 3.1.0](https://github.com/blader/humanizer/blob/main/SKILL.md). Reader-facing labels use "update", "Before this update" and "After this update". Domain names, stored Status strings, field data, identifiers and timestamps are unchanged.

## Final A-only revision

`npm run build`, ESLint on the changed frontend files and `git diff --check` completed successfully after removal. Chromium screenshots show the field-edit example with orange rows and the Status example with its two historical values. This revision did not run an automated interaction suite. The portable HTML was updated and packaged; direct local-file opening remains unverified in this environment.

## Implementation boundary

This remains a design preview. Production integration and deployment are separate work. Desktop light and dark themes are the existing design scope.
