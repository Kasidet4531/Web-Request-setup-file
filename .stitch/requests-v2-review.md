# Requests v2 — Desktop

4 October 2026. The user accepted Dashboard v5 and authorized the next page. Requests now uses its approved neutral Desktop shell, English UI, Light/Dark palette and one-line Status disclosure. Two role screens and four baseline visual states; no Mobile design work.

| Role | Screen | Light | Dark |
| --- | --- | --- | --- |
| Requester | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=5670599282614645185) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v2-requester-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v2-requester-desktop-dark.png) |
| Setup Owner | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=7979127696275533627) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v2-owner-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/requests-v2-owner-desktop-dark.png) |

## Page behavior

Requests is the shared submitted-work list. Private drafts remain in My Drafts. It has no Dashboard summaries, creator-only switch or Owner department scope selector. Keyword, exact Status and Product type filters sit together above the list. Active filters change the result label, and Clear filters restores all five sample rows.

The list uses four groups: Request (title, number, product type), Status (single line with overflow ellipsis), Schedule (due date and priority), and Responsibility (Requester plus Owner / Dept). Long full Status strings remain available on hover/focus/click in a dismissible popover. Completed and cancelled styling uses the database catalog kinds; all open-kind stages including 99% share neutral styling. No status changes or transitions occur when filtering or viewing.

Both roles have Audit History. Requester retains Export and Setup Owner omits it. Row links open the corresponding future detail route. The page preserves the existing 100-record frontend query limit; this preview displays five fictional rows with truthful sample counts and disabled single-page pagination.

## Verification and limits

Desktop browser checks cover both themes, no horizontal overflow, exact 16 non-Draft Status options, combined Product type and Status filters, search with no matches, clear/reset, full-name disclosure, catalog kind styling, role navigation and unchanged request statuses. Reports: [Requester](requests-v2-requester-desktop-verification.json), [Setup Owner](requests-v2-owner-desktop-verification.json).

Source behavior was checked with CodeGraph before designing. The prototypes reuse the exported approved Stitch Dashboard shell, so no extra Mobile or alternative-layout generation is needed. They are uploaded to the existing private Stitch project. UI styles/icons are inline; upload warnings refer to intentional application route links.

All records and names are fictional, not live database results. Navigation, New Request and pagination require application integration. The inherited artifact may retain earlier responsive styles, but Mobile is not designed or verified here. No production source or database writes were performed.

Request Detail is proposed after this page is reviewed. Implementation can begin after the main Dashboard → Requests → Detail flow has been agreed. Manual Status editing details still require clarification before designing Detail; this shared read-only list is unaffected.
