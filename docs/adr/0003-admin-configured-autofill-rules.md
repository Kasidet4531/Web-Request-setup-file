# 3. Admin-Configured Auto-fill Rules

We decided to implement a dynamic schema-driven auto-fill mechanism configured by administrators through database rules, rejecting the options of hardcoded mapping or automated recent co-occurrence suggestions.

## Context

When users enter values into key reference fields (such as Reference PSF), other fields (like Product, Wafer FAB) should be populated automatically. We need to choose between hardcoding these relationships, letting admins define rules dynamically, or automated algorithmic matching.

## Decision

We chose Admin-Configured Auto-fill Rules stored in the database (`autofill_rules` table) because:
- **No code changes required**: Admins can add or modify rules as new fields are introduced without requiring software updates or deployments.
- **Predictable user experience**: Unlike automated suggestions based on history which can be inconsistent or confusing, this policy ensures that autofilled values are explicit and predictable.
- **Controlled override**: The values auto-filled remain fully editable by the user, and will show an "Auto-filled" badge to notify the user.
