> Historical design iteration. The latest approved scope is Desktop only, with single-line Status ellipsis and summary selection indicated without a Filter label. See [Dashboard v5](dashboard-v5-review.md) for current designs.

# Dashboard v4 — neutral redesign

4 October 2026. Current page: **Dashboard**. English UI for Requester and Setup Owner, Desktop and Mobile, Light and Dark. This replaces the previous blue-led Dashboard direction; Requests and Detail work are paused pending feedback.

Two responsive Stitch screens share the same layout and interaction code. Each screen is reviewed at 1280 × 800 desktop and 390 × 844 mobile in both themes: eight visual states, not eight independent Canvas screens.

| Role / device | Current screen | Light | Dark |
| --- | --- | --- | --- |
| Requester · Desktop | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=596760351562290837) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-requester-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-requester-desktop-dark.png) |
| Requester · Mobile | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=596760351562290837) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-requester-mobile-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-requester-mobile-dark.png) |
| Setup Owner · Desktop | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=4400343785376533824) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-owner-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-owner-desktop-dark.png) |
| Setup Owner · Mobile | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=4400343785376533824) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-owner-mobile-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v4-owner-mobile-dark.png) |

## Design changes

Light uses white surfaces on a warm neutral canvas. Dark uses charcoal surfaces without navy panels. Blue is concentrated on New Request and small selected-state accents. Orange highlights overdue work; green highlights completed work. There are exactly three summary controls and one work queue with Request, Status, Due date and Owner / Dept columns.

Mobile uses the same records as vertical cards, three compact summaries, persistent search, collapsed secondary filters and a navigation drawer. Audit History is present for both roles on both devices. Requester retains Export; Setup Owner omits it and has exactly Related work / Created by me / PSF department work. No role switch or Admin tools are introduced.

Status labels preserve exact configured database values. They show a maximum of two lines, with actual overflow ellipsis when needed; a mobile label that fits within two lines can remain fully visible. Hover and keyboard focus reveal the full name on desktop. Click/tap opens the same full-value popover; Close, Escape and outside click dismiss it. The popover stays inside the viewport. These controls never modify Status. There are no automatic transitions or Next/Approve/Mark Complete actions.

## Evidence and prototype limits

The complete non-Draft selector contains all 16 exact names from [the read-only PostgreSQL catalog snapshot](status-catalog-evidence.json), including the long 93% string with its literal backslash. Database credentials are excluded from design artifacts and prompts. The previous CodeGraph inspection and current Dashboard source inspection establish the existing scopes and 25-item pagination contract.

The five rows and identities are fictional. Counts are dated aggregate examples from 4 October 2026: Requester 25 / 15 / 0 and Owner MFG 44 / 24 / 6. The preview footer identifies sample rows. Scope selection is a visual control; it is not connected to live scoped queries. Local search, Status filters, empty-state reset, summary sample filtering, theme controls and status disclosure work in the exported prototype. The sample rows contain no completed records, so the Completed filter has an empty sample list even where the dated total is six.

Navigation, New Request, scopes and pagination require application integration. Stitch reports local-route links as asset warnings; those links are intentional future routes, and all visible icons/styles are inline. Production source and database data have not changed. The broader Audit History implementation gap remains documented in [the access policy](../docs/audit-history-access.md).

## Verification

Browser verification results are recorded separately for both roles and both viewport sizes. Checks cover both neutral themes, no horizontal overflow, exact database Status options, two-line clamp with desktop overflow, full-value tap/focus disclosure and dismissal, viewport containment, filters and empty-state clearing, no Status mutation, mobile navigation and secondary filters. This is prototype verification, not production accessibility certification.

- [Requester desktop checks](dashboard-v4-requester-desktop-verification.json)
- [Requester mobile checks](dashboard-v4-requester-mobile-verification.json)
- [Owner desktop checks](dashboard-v4-owner-desktop-verification.json)
- [Owner mobile checks](dashboard-v4-owner-mobile-verification.json)

[Design rules](DESIGN.md) and [database Status interaction rules](../docs/status-catalog-and-manual-updates.md) are the current specification. Review Dashboard v4 before moving to the next page.
