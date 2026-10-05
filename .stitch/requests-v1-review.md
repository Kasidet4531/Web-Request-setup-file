> Historical design iteration. The latest approved scope is Desktop only, with single-line Status ellipsis and summary selection indicated without a Filter label. See [Dashboard v5](dashboard-v5-review.md) for current designs.

# Requests review — NXP-inspired Light / Dark

4 October 2026. The user authorized the next page after Dashboard. Scope: `/requests` only, English UI, Requester and Setup Owner, Desktop and Mobile. Four generated Stitch screens each include working local Light/Dark controls. Production source and database records were not changed.

| Role / device | Stitch design | Light | Dark |
| --- | --- | --- | --- |
| Requester · Desktop | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=4a4b356629524e3ea2d4d88e66585335) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-requester-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-requester-desktop-dark.png) |
| Requester · Mobile | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=a22d8f79e3814f7685a3e9d6fa6e8af5) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-requester-mobile-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-requester-mobile-dark.png) |
| Setup Owner · Desktop | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=62af5714efd748b3b39fe3c49e0647ba) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-owner-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-owner-desktop-dark.png) |
| Setup Owner · Mobile | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=b6ade8d12a3a46c48c72ff954794c442) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-owner-mobile-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v1-owner-mobile-dark.png) |

## Requests-specific UX

One shared-work list, no Dashboard count tiles or department/creator scopes. Private Drafts remain in My Drafts. Group the current fields into Request (PSF title, ID, product type), full Status, Schedule (priority, due date), and Responsibility (requester, owner/department). Desktop uses a four-column table; mobile uses vertical records with persistent search and secondary filter disclosure. Both roles have Audit History; only Requester has Export.

The Status filter includes all 16 non-Draft catalog strings, checked against the [read-only PostgreSQL evidence](status-catalog-evidence.json). Long 93% and 99% names wrap without aliases. Classification uses catalog kinds; percent prefixes are not progression rules. List filters never change record Status and there are no stage-action buttons or transition matrix.

Product type is a separate text filter. The list API is already queried with a 100-record page limit; it differs from Dashboard 25. These static screens deliberately show five fictional samples and truthful 1–5 of 5 counts, not an invented live total. The samples include open, completed and cancelled kinds. Only the first sample is overdue, using 4 October 2026 Bangkok as the reference date.

## Verification and limits

Inspected all eight Light/Dark images at 1280×800 desktop and 390×844 mobile. The real theme controls switch modes on each generated screen. Verified exact catalog options, no horizontal page overflow, Status filtering to one sample, an empty result after unmatched search, Clear filters restoring five records, and unchanged record Status attributes throughout those interactions. Both mobile drawers expose Audit History; Owner navigation omits Export. Mobile menu/theme/filter controls use 44px touch height. See the individual verification JSON files named in requests-review.json.

Local filters operate only on fictional static records. Their keyword fields differ between generated previews and do not validate production search across PSF/probecard values. Navigation points to intended routes, but those destinations and New Request/Export are not implemented in the preview. This is design review, not API integration, production permission verification or full keyboard/screen-reader/contrast certification. The live Audit History permission update remains pending as documented in [the access contract](../docs/audit-history-access.md).

Read-only database inspection used pg.Pool; CodeGraph traced current list/query fields before file searches, and RTK was used for shell output. No connection credentials or real request/person values were sent to Stitch.

## Next page

Review Requests before proceeding to Request Detail. The open choice about manual Status selection plus Save Status versus a read-only detail presentation belongs to that next-page discussion; this read-only list contains neither Status editing nor workflow transitions.
