# Complete Stitch Desktop design suite

Current scope, 5 October 2026: the complete reviewed Desktop suite is approved for application implementation, including all Admin pages, shared collapsible navigation, explicit parent Back controls and breadcrumbs. Preferred tabbed Request Detail v1 is retained. English UI, Desktop Light/Dark only. Working-tree source implementation is complete; this is not a production deployment record.

- [Complete suite review and Stitch links](suite-review.md)
- [Page/role inventory](suite-inventory.json)
- [Current design rules](DESIGN.md)
- [Admin source evidence](admin-page-evidence.md)
- [Exact Status and manual saving](../docs/status-catalog-and-manual-updates.md)
- [All-role Audit History requirement](../docs/audit-history-access.md)

Dashboard v5 and Requests v2 retain their approved bodies. Detail retains v1 tabs/Edit/Save/Cancel and separate Save Status, adds breadcrumb + Back and shared navigation. Earlier Detail v2 original-layout/color-only captures are historical. The latest batch request supersedes the earlier page-by-page review preference and Admin deferral.

The implementation uses authenticated all-role Audit History with creator-private Draft and unreleased PSF visibility rules, runtime exact catalog Status values and explicit manual saving. The shell starts in Light on first visit and remembers explicit Light/Dark and Desktop sidebar collapse choices per browser. The Stitch previews remain design references, not API or permission evidence. Local unit, HTTP, SQL and browser checks passed; see [implementation verification](../docs/superpowers/plans/2026-10-05-stitch-desktop-implementation.md). The configured PostgreSQL and LDAP services have not been exercised or mutated by this implementation work.
