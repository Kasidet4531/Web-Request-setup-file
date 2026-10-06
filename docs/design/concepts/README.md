# Direction C concept set

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](../../status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. The retained body is historical evidence, not a Status catalog or current UX instruction. Do not reuse old named-stage buttons or transition-editor requirements.

These five ImageGen concepts propose one engineering-operations design for the existing PSF application. They are review artifacts, not raster assets to embed in the application. Records, people, versions, and counts are illustrative synthetic data.

| Concept | Screen / purpose |
|---|---|
| [Queue](queue.png) | Compact work counts, aligned filters, request identity and status table |
| [Detail](detail.png) | Request identity, ownership, independently saved forms, actions and history |
| [Create](create.png) | Draft-first creation, schema fields, optional help rail |
| [Form Management](admin.png) | Family selection, version table and lifecycle actions |
| [Mobile detail](mobile.png) | Collapsed navigation, identity, actions above long forms |

Read [design specification](../2026-10-03-frontend-design-spec.md) and [implementation plan](../2026-10-03-frontend-implementation-plan.md) with these concepts. The specification fixes tokens, shared geometry, field types, required/default behavior, statuses, and actions where ImageGen produces minor artifacts. Preserve the source contract rather than copying a generated chevron, asterisk, invented default, or unsupported action.

The queue supplies the shared shell/composition reference. Detail and create were revised to preserve default text controls and optional PSF fields. Form Management was revised to remove a field dialog that would belong in a version editor. Mobile shows the intended reading order; its Product field must use the actual schema text control, not the remaining generated dropdown chevron. Use the spec's accessible status icons consistently, and solid color buttons rather than generated shading. Keep existing New Request header action where authorized even if a concept omits or relocates it.

The complete app continues in this same system: request lists/drafts, user/status/autofill administration, form editor, history, export, login, and honest unfinished-route states. Produce a focused concept before a screen edit when the primary references and written specification do not resolve its composition.

Initial generation briefs are saved in [imagegen-briefs.json](imagegen-briefs.json); final edit/mobile prompts are recorded in [correction prompts](imagegen-corrections.md). All concepts used the built-in ImageGen tool. Correction passes used the initial target and queue as references; no fallback API/CLI image generation was used. Discarded first concepts remain outside the repository and are not implementation references.

Native sizes: queue/detail/admin 1536×1024; create 1487×1058; mobile 853×1844. Compare at native size when practical, then also verify the spec's CSS viewports. Token dimensions and accessibility contrast remain exact even when raster scale varies.

During implementation, capture desktop and mobile renders and inspect each with its reference using `view_image`. Record layout, typography, palette, geometry, copy, status/field semantics, and responsive differences. Generated concept data does not replace API data. No implementation or concept approval is claimed by this folder.
