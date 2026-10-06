# Dashboard v5 — Desktop

4 October 2026. Current design scope: **Desktop only**, Requester and Setup Owner, English UI, Light and Dark. Two Stitch screens, four baseline visual states. Mobile design and verification are out of scope; prior Mobile files remain historical.

| Role | Current screen | Light | Dark |
| --- | --- | --- | --- |
| Requester · Desktop | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=17424635658553134230) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v5-requester-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v5-requester-desktop-dark.png) |
| Setup Owner · Desktop | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=736498082458463041) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v5-owner-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v5-owner-desktop-dark.png) |

## Requested changes

Status now occupies a single line and ends with an actual overflow ellipsis when its text exceeds the badge width. Exact configured database strings remain in DOM values and accessible names. Hover, keyboard focus or click reveals the full string in a popover. Close, Escape and outside click dismiss it. Viewing Status never changes data or triggers a workflow transition.

Summary cards contain only the group label, count and a visual selection indicator. Filter, Filtered and Filtering are absent from card text. A checkmark at the top right and a category-colored outline identify the selected group; aria-pressed exposes the same state to assistive technology. Only one card is selected. The check and outline move together when the group changes, and the Work queue scope label follows it. Clear filters restores Open work. A green Completed group icon is not the selection indicator; the dedicated selection check sits at the opposite corner and only appears on the active card.

The v4 neutral palette, three summary controls, four queue columns, Audit History for both roles, Requester Export and the Owner scope values are retained. No mobile design work is included in this revision.

## Prototype verification and limits

Desktop checks at 1280 × 800 cover Light/Dark switching and neutral surfaces, no horizontal overflow, single-line truncation, exact non-Draft catalog values, full-name disclosure/dismissal, selected-card check/outline movement, single selection, Clear filters reset and unchanged request statuses. Search, local Status filtering and empty-state clearing remain available. The matching browser reports are [Requester](dashboard-v5-requester-desktop-verification.json) and [Setup Owner](dashboard-v5-owner-desktop-verification.json).

These are exported Stitch prototypes. Five rows and identities are fictional. Aggregate counts are dated examples from 4 October 2026 (Requester 25 / 15 / 0, Owner MFG 44 / 24 / 6), not live API totals. All five sample records are open-kind entries, so Completed has an empty sample list even when the dated total is six. Scope controls, navigation, New Request and pagination require production integration. The inherited HTML can contain earlier responsive styles, but Mobile is neither a design deliverable nor verified in v5.

Production source and database data are unchanged. [DESIGN.md](DESIGN.md) and [Status interaction rules](../docs/status-catalog-and-manual-updates.md) contain the updated Desktop-only specification. Requests and Detail remain paused until Dashboard feedback is addressed.
