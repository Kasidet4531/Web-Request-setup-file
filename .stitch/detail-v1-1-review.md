# Request Detail v1.1 — breadcrumb on the preferred v1 design

4 October 2026. The latest product-owner direction returns to Stitch Detail v1 and asks for clearer page ancestry. The intervening original-layout/color-only Detail v2 is historical exploration and must not guide implementation. Desktop only, English, Requester and Setup Owner, Light/Dark.

The breadcrumb **Requests › PSF-2026-0039** replaces Back to Requests above the masthead. Requests links to /requests. The current request number is not linked and uses aria-current=page. The nav has an accessible Breadcrumb label, an ordered list, a decorative separator and visible keyboard focus. Dashboard is a peer route rather than a parent, so it is not added to this path. Switching Requester Information, PSF Created Information or History tabs does not change the breadcrumb: they are sections of one request, not deeper routes. The full request title stays in the masthead.

Everything else retains [v1 layout and behavior](detail-v1-review.md): tabs, role-specific initial panel, Edit/Save/Cancel, Additional details, exact single-line Status disclosure, separate Save Status, dirty-form gating, permissions, PSF release visibility and all-role Audit History. V1 form interaction reports remain applicable because source comparison confirms that only breadcrumb markup and its styles changed. No new mobile work, production source changes or DB writes.

| Role | Stitch screen | Light | Dark |
| --- | --- | --- | --- |
| Requester | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=5633881947599169946) | [Light](detail-v1-1-requester-desktop-light.png) | [Dark](detail-v1-1-requester-desktop-dark.png) |
| Setup Owner | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=7913272643343574371) | [Light](detail-v1-1-owner-desktop-light.png) | [Dark](detail-v1-1-owner-desktop-dark.png) |

Verification: [breadcrumb checks](detail-v1-1-verification.json) confirm actual parent link, current-page semantics, keyboard focus, stable breadcrumb across tabs, unchanged v1 source beyond the breadcrumb, and no horizontal overflow. Both themes were captured through the actual theme button. Application navigation targets remain integration links in a static Stitch preview; full route navigation requires the real router. Saves remain local preview state as in v1, with no API integration.
