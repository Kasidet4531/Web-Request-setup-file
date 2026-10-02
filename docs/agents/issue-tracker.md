# Issue tracker: GitHub

These are repository conventions for GitHub issue operations, which require an
installed and authenticated `gh` CLI. This document does not establish current
remote issue state. Local `docs/github_issues*.md` files are historical snapshots;
see [the documentation index](../README.md). Creating/updating issues or sending
comments requires the user's authorization for the action.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <saved-body-file>`. Save exact Markdown to a file for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body-file <saved-body-file>`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Use a GitHub issue when the user has authorized publication; the skill's wording
alone does not prove that the CLI/account is configured or that publication is authorized.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
