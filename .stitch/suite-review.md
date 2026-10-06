# Complete Desktop design suite — 5 October 2026

[Open Stitch project](https://stitch.google.com/projects/15540984743145901568)

31 page/role/state screens are uploaded to the existing Stitch project. Each HTML design supports Light and Dark; 62 local browser captures document both themes. This batch includes the remaining primary pages and every Admin route, plus shared navigation updates on the previously reviewed Dashboard, Requests and preferred tabbed Request Detail v1. All interface copy is English. Mobile is outside the agreed scope.

## Navigation and design decisions

- Sidebar expands to 220 px and collapses to a 72 px icon rail. The toggle remains outside the rail. Active navigation, accessible labels, theme control and account control remain available.
- Nested pages have an explicit Back to their parent and breadcrumbs. Detail tabs do not add false breadcrumb depth. Root pages show their current location without an invented Back destination.
- Leaving an edited form opens Stay on page / Discard and leave. Staying retains edits. Separate Save Status commits a manually selected exact catalog string; saving other information does not change Status.
- Status is at most one line, truncates with a real ellipsis, and exposes the complete exact value. It is never abbreviated into legacy codes or used as an automatic workflow transition.
- Warm neutral Light and charcoal Dark surfaces follow the agreed NXP-inspired direction with restrained action color and orange/green accents. Dashboard selection uses a checkmark and colored outline without a Filter label on cards.
- Audit History is available to every authenticated role, including non-sensitive configuration events. Private Drafts and unreleased PSF field values keep their existing access boundaries.

## Primary screens

| Page / role | Stitch | Light | Dark |
| --- | --- | --- | --- |
| Dashboard / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=12918096961075440925) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-dashboard-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-dashboard-requester-dark.png) |
| Requests / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=9880368216225540594) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-requests-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-requests-requester-dark.png) |
| Request Detail / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=7621893470971561441) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-detail-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-detail-requester-dark.png) |
| Dashboard / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=3360253266530025101) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-dashboard-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-dashboard-owner-dark.png) |
| Requests / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=10964833883209500206) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-requests-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-requests-owner-dark.png) |
| Request Detail / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=13760605604055105348) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-detail-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-detail-owner-dark.png) |
| New Request / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=7049584366369927789) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-new-request-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-new-request-requester-dark.png) |
| My Drafts / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=5463900447438137991) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-my-drafts-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-my-drafts-requester-dark.png) |
| ST Fab template map review / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=10752246070385433494) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-draft-detail-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-draft-detail-requester-dark.png) |
| New Request / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=11725053362149875942) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-new-request-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-new-request-owner-dark.png) |
| My Drafts / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=4561225278074530880) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-my-drafts-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-my-drafts-owner-dark.png) |
| ST Fab template map review / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=11593276805698257844) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-draft-detail-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-draft-detail-owner-dark.png) |
| Request History / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=15654756040507272096) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-request-history-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-request-history-requester-dark.png) |
| Audit History / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=13287506031561753362) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-audit-history-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-audit-history-requester-dark.png) |
| Request History / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=16772701750426698848) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-request-history-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-request-history-owner-dark.png) |
| Audit History / owner | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=16046167029017161966) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-audit-history-owner-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-audit-history-owner-dark.png) |
| Export to Excel / requester | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=14998026508623173160) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-export-requester-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-export-requester-dark.png) |
| Company sign-in / public | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=3832818407496273134) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-login-public-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-login-public-dark.png) |

## Admin screens

| Page / role | Stitch | Light | Dark |
| --- | --- | --- | --- |
| Audit History / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=8993818983778680877) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-audit-history-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-audit-history-admin-dark.png) |
| Export to Excel / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=8838975277194552739) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-export-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-export-admin-dark.png) |
| Administration / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=13319518955257527315) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-admin-dark.png) |
| Users & Roles / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=14697717261015693809) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-users-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-users-admin-dark.png) |
| Status Management / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=10495529682721251919) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-status-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-status-admin-dark.png) |
| Form Management / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=11595710009703226268) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-forms-requester-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-forms-requester-admin-dark.png) |
| Requester Information Form / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=1111836746780652368) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-editor-requester-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-editor-requester-admin-dark.png) |
| Form Management / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=5769791481467384463) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-forms-psf-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-forms-psf-admin-dark.png) |
| PSF Created Information Form / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=5079366848255975639) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-editor-psf-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-editor-psf-admin-dark.png) |
| Auto-fill Rules / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=2187442404172737842) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-autofill-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-autofill-admin-dark.png) |
| Master Data / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=16640110873866473275) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-master-data-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-master-data-admin-dark.png) |
| Requester Information Form — Active / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=16780460359036933340) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-active-requester-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-active-requester-admin-dark.png) |
| PSF Created Information Form — Active / admin | [Open](https://stitch.google.com/projects/15540984743145901568?node-id=10463777411470288956) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-active-psf-admin-light.png) | [View](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-admin-form-active-psf-admin-dark.png) |

## Coverage and permissions

- New Request saves an incomplete private Draft. Draft Detail saves changes separately from explicit Submit request and the chosen initial Status. My Drafts contains only drafts created by the current account.
- Request History has its own parent Back and breadcrumb. Audit filters use explicit Apply and Clear. Dates identify their UTC filter boundary and displayed Asia/Bangkok timezone.
- Export is shown for Requester and Admin according to existing access. Setup Owner does not receive an Export navigation link. The preview is fictional and does not represent an authorized export count.
- Users & Roles edits roles and Setup Owner department, with GNTC/MFG required for owners. Company identity is read-only; no new account creation or password reset feature is introduced.
- Status Management includes protected Draft, exact names, name validation, explicit replacement when deleting a used Status and a configurable PSF visibility trigger. No transition editor is introduced. No configured trigger means Status updates do not release PSF data.
- Form Management includes separate Requester and PSF catalogs, editable Draft versions and read-only Active versions. One Draft per family, explicit Publish/Discard confirmation and stable keys are retained. Requester Name and Product Type remain required. Publishing does not silently upgrade saved request schemas.
- Auto-fill uses the existing previous-completed-PSF source, excludes the trigger from targets and requires at least one target. Master Data retains its existing unavailable placeholder instead of introducing unsupported data management.

## Review guide

Compare New Request and Draft Detail first, then the Admin hub, Status Management, both form families, Users & Roles and Auto-fill. On the HTML previews, use the top-left sidebar toggle, switch themes, follow Back, edit a field and try leaving without saving. For Status, select another catalog value and verify it remains pending until Save Status. On Draft Detail, Save draft changes retains Draft; Submit request is a separate action.

[Collapsed navigation — Request Detail Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-detail-requester-collapsed-dark.png)

## Prototype boundaries and integration notes

These are design previews with fictional records and local, reload-reset interactions. They do not authenticate, persist API or PostgreSQL changes, create actual export files or complete export jobs. Advanced form JSON checking and management dialogs demonstrate design intent; full server validation, concurrency, schema upgrade prompts, permission enforcement and all error/loading states remain integration work.

Navigation hrefs describe app destinations, not independently deployed pages on Stitch. Fixture request routes use human-readable sample request numbers; production routes must use real request UUIDs while breadcrumbs display request numbers. Audit Request ID filtering must likewise map to the real API identifier. `/admin/form-config/$version` remains the Requester-family alias; `/admin/form-config/$formKey/$version` selects an explicit family; `/` redirects to Dashboard.

Upload responses succeeded for all 31 screens. The CLI warned about relative navigation hrefs; checks found no local rendering assets. Styles and scripts are inline and font resources use HTTPS. Canvas-rendered appearance was not separately verified; all 62 theme images and navigation checks were verified in the local desktop browser.

## Verification evidence

- [31 screens / 62 visual states](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-visual-verification.json)
- [12 representative interaction checks](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-interaction-verification.json)
- [Longest Status: exact value, ellipsis and disclosure](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-long-status-verification.json)
- [Upload and verification summary](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-verification.json)
- [Inventory and route aliases](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/suite-inventory.json)
- [Admin source evidence](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/admin-page-evidence.md)
- [Current DESIGN.md](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/DESIGN.md)

Production frontend/backend source and database are unchanged. This suite is awaiting user review; it retains the previously preferred page bodies and supersedes the prior page-by-page scope for this batch.
