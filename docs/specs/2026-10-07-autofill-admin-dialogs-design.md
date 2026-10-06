# Auto-fill Rules and Status recipient layout

Approved in chat on 7 October 2026. Implement in the existing `main` checkout.

## Auto-fill Rules

- Each rule has an administrator-selected Active / Inactive status.
- New rules default to Active; the administrator may create them Inactive.
- Editing an Inactive rule preserves that status until Active is explicitly
  selected. Requests omitting status preserve the stored status when editing;
  legacy create requests default to Active.
- Existing schema validation remains mandatory for saves. Active requires a
  valid trigger and all selected targets. Schema publication may still disable
  invalid active rules; restoring fields does not reactivate them.
- Manual disabling is described separately from schema-invalid inactivity.
  Inactive rules do not drive runtime autofill or field trigger metadata.
- Both Add and Edit open the same modal editor. Save persists changes;
  Cancel/Escape/X discard them and return focus to the opener. Pending saves
  block closing and duplicate submissions. Failed saves retain the draft.
- Remove the Source table column. Historical completed-request lookup remains
  the rule's source; explain it briefly in the editor.
- Give Fill target fields the freed space. Show labels in horizontally arranged
  items that wrap with available width. Small screens retain usable scrolling.
- Show field labels in the table, trigger dropdown and target checklist, without
  canonical keys. Keep keys in stored mappings. Unavailable fields have a clear
  Removed field label and remain identifiable by their position in the editor.

## Status Management

- In Edit Status, all To/CC input and user-picker controls precede the added
  recipient lists. Adding/removing a recipient grows those lists below the
  controls, so neither To nor CC inputs shift when lists grow.
- Preserve current recipient validation, deduplication, removal, email policy
  behavior and modal Save/Cancel behavior.

## Verification

Exercise explicit inactivity through controller/storage/runtime lookup, modal
save/cancel/error/focus behavior, label-only field presentation and To/CC input
position. Check desktop/mobile layouts and light/dark modes using disposable
local fixtures. Application runtime changes require fresh test evidence.
