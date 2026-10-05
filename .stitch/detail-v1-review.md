# Request Detail v1 — Desktop

Latest direction: retain this v1 layout and add the breadcrumb specified in [current v1.1 review](detail-v1-1-review.md). The original-layout/color-only v2 exploration is superseded.

4 October 2026. Requests v2 is approved, and the user authorized Request Detail. English UI, Desktop only, Light/Dark, two role screens. The user confirmed selecting Status manually plus a separate Save Status button.

| Role | Screen | Light | Dark |
| --- | --- | --- | --- |
| Requester | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=5509305733922996617) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/detail-v1-requester-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/detail-v1-requester-desktop-dark.png) |
| Setup Owner | [Stitch](https://stitch.google.com/projects/15540984743145901568?node-id=7406103081578952994) | [Light](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/detail-v1-owner-desktop-light.png) | [Dark](/home/kasidet4531/Desktop/Web_Setup_file/Web-Request-setup-file/.stitch/detail-v1-owner-desktop-dark.png) |

## Layout and permissions

The approved Dashboard/Requests shell surrounds a compact request masthead and metadata. The header Status is a single line with overflow ellipsis and full-name hover/focus/click disclosure. The independent Change Status selector contains the 16 exact non-Draft catalog names; Save Status remains disabled until a different choice is pending.

Three keyboard-accessible tabs show one section at a time: Requester Information, PSF Created Information and History. Requester starts on Requester Information; Setup Owner starts on PSF Created Information. Both roles can edit Requester Information on an accessible submitted request, matching the current backend; the design does not impose creator-only editing. Requester Name remains a displayed identity. Additional details groups the three optional Requester fields so they remain reachable without showing everything at once. Edit information reveals controls and explicit Save/Cancel.

Owner can view/edit PSF Created Information, including on shared requests outside their department under the existing role policy. Requester before release sees an availability notice with no PSF values in DOM. Requester after release must see PSF read-only; that separate released fixture is specified but not rendered in these two main previews. No release is inferred from a percentage prefix. History is visible to both roles; unreleased PSF values are excluded from the Requester History fixture. Shared Audit History navigation remains present for all authenticated roles, and only Requester retains Export.

## Save behavior

Choosing Status only changes its pending value. An explicit Save Status changes the local displayed Status and appends a local history item. Saving/canceling either information form never saves Status. Dirty form values disable Status controls with save/discard guidance. Cancel restores the most recent saved form values. Tab changes preserve editing state. The preview also has a before-unload unsaved-data guard.

There are no next-stage actions, transition paths, approval shortcuts or percentage progression. The submitted-request fixture uses the long 93% Status; Draft creation/initial submission remains a separate lifecycle and is not replaced by this screen.

## Source and verification

CodeGraph traced RequestDetailShell, mapRequestRow, canActorEditPsfCreatedData, requesterFieldsAreReadOnly, getAllowedNextStatuses and getActiveSchema. Active form definitions were read through pg.Pool in a read-only transaction; only field metadata and non-identity options were saved in [the schema evidence](detail-schema-evidence.json). No request records or credentials were sent to Stitch. The fictional fixture uses the active Requester v2 (11 fields) and PSF v1 (10 fields). Production rendering must use each request's own schema snapshots, rather than forcing active versions onto existing requests.

Browser reports: [Requester](detail-v1-requester-desktop-verification.json), [Setup Owner](detail-v1-owner-desktop-verification.json). They cover Desktop Light/Dark and no horizontal overflow, exact Status catalog, single-line disclosure, keyboard tabs, field counts, PSF value exclusion, Owner PSF/Requester editing, pending versus saved Status, dirty-form gating, form save independence, Cancel and History access. Additional images show [Requester edit](detail-v1-requester-desktop-edit.png), [Owner edit](detail-v1-owner-desktop-edit.png), [Requester restricted PSF](detail-v1-requester-desktop-psf-restricted.png), [Requester History](detail-v1-requester-desktop-history.png) and [Owner History](detail-v1-owner-desktop-history.png).

These are static exported Stitch prototypes using fictional data. Saves affect only local browser state and reset on reload; no backend or database writes occur. Real saving requires server permissions, validation, revision/conflict handling, persistent release state and transactional audit. API loading/error/conflict states and the released Requester/Draft fixtures are integration states, not additional claims of verified screens here. Intentional application links explain Stitch's local-asset warnings. No Mobile design work or production source changes.
