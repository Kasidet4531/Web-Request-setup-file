> Historical Dashboard v3 review. Superseded by Dashboard v4; use dashboard-v4-review.md for the current direction.

# Dashboard review — preceding page

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../docs/status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. Use complete configured strings for every displayed request Status. This documentation update does not change application source.

4 October 2026. Current page: Dashboard only. The original four light-only samples are superseded by these four role/device screens. Each final screen includes a local theme toggle, and Light/Dark share the same DOM and work data. Eight static visual states are provided below.

| Role / device | Current design | Light image | Dark image |
| --- | --- | --- | --- |
| Requester · Desktop | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=0f168c0af2ca49ab87b9725a38a61f07) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v3-requester-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v3-requester-desktop-dark.png) |
| Requester · Mobile | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=1e1991297e454f30ac2256b247af3c31) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v2-requester-mobile-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v2-requester-mobile-dark.png) |
| Setup Owner · Desktop | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=176a7923f20e4a5e8c4f3496d035c281) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v2-owner-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v2-owner-desktop-dark.png) |
| Setup Owner · Mobile | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=277752a0976e481bab2b223bb303c13d) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v2-owner-mobile-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/dashboard-v2-owner-mobile-dark.png) |

## Audit History correction status

The confirmed all-role access rule is recorded in DESIGN.md and [the access policy](../docs/audit-history-access.md). Requester Desktop now has an exported, verified Audit History link to `/history` in both themes. The other three previews above still need this navigation correction: Stitch returned an empty variant or a DOM operation without an updated HTML artifact. Do not treat those previews as permission specifications or claim their navigation has been corrected. Their prior visual and theme verification remains applicable to version 2.

## Data and workflow alignment

The PostgreSQL database specified by the user was inspected through pg.Pool, with read-only session defaults and BEGIN READ ONLY transactions. No migrations, seeding or data writes were performed. CodeGraph traced the Pool configuration and Dashboard query path; RTK was used for condensed shell output. Connection credentials are not included in these artifacts or Stitch prompts.

The live configuration has 17 catalog entries. The active Requester form has 11 fields and PSF Created Information has 10. The Dashboard now uses PSF-specific titles and compact Probecard references, and accommodates status names up to 71 characters. Status percent prefixes are catalog labels, not calculated progress. The [exact 17-entry database snapshot](../docs/status-catalog-and-manual-updates.md) is the current name reference. Use full Status strings without friendly aliases. Do not add action-driven automatic Status changes, Next/Approve/Mark Complete buttons or a transition matrix. All five sample row statuses are kind=open, including 99%; they share open-work badge styling. Drafts, Cancelled and Completed are classified using catalog kinds, not name/percent heuristics.

Requester example totals: Open 25 / Overdue 15 / Completed 0. Setup Owner example, PSF department work MFG: Open 44 / Overdue 24 / Completed 6. These are anonymous aggregate snapshots from 4 October 2026, not live API queries or totals claimed for the current signed-in user. The five rows, names, request numbers and Probecard values are fictional. All Owner example rows match MFG. Overdue follows the backend's Bangkok-date rule; only the first sample row is overdue.

The Status selector shows seven representative exact catalog values to review the long-label treatment; it is not a complete live catalog integration. Keyword search copy matches request number, title, PSF names and Probecard support, without promising Product search.

## Scope and layout

English UI, NXP-inspired blue/orange/green accents, shared light/dark tokens and the same role permissions. Requester retains Export; Owner has exactly Related work / Created by me / PSF department work and omits Export. Both roles must show Audit History in shared navigation and omit Admin tools, following the [4 October product clarification](../docs/audit-history-access.md). The live code still needs the corresponding navigation/API access update; these are design previews. Desktop uses four queue columns; mobile uses compact vertical items and collapsed secondary filters. The preview clearly identifies five sample rows; the backend page size remains 25.

## Verification and limits

All four generated designs were inspected in a browser at 1280×800 desktop and 390×844 mobile, with Light/Dark switching verified through the actual theme buttons. Inspected states had no horizontal page overflow; visible desktop toolbar controls remained inside the viewport after bounding the long-label selectors. Owner work scope, MFG rows and mobile filter values were verified. Mobile menu/theme buttons measured 44×44. The inspected Owner desktop dark status badge measured 5.21:1 text/background contrast; this is not a full accessibility certification.

The matching PNGs and captured HTML are static review artifacts. Theme switching works in the generated HTML preview, but navigation, summary filtering, search, pagination and New Request are not connected to the production backend. Production source was not modified, and these artifacts do not establish production keyboard, screen-reader, loading/error or API integration behavior.

The next page remains Requests, after Dashboard feedback has been addressed. Design rules are recorded in DESIGN.md and synced to the existing private Stitch project.
