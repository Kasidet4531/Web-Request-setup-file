# PSF Setup File Web Application

This project is a Web Application to manage PSF Setup File Requests.

Work in the current `main` checkout. Maintained guides include dated feature updates.
For behavior changes, read
[current implementation](docs/current-implementation.md), [documentation index](docs/README.md)
and [domain glossary](CONTEXT.md) before relying on historical specs/ADRs/plans.
Source is authoritative; documentation statements about deployment or live
verification require their own evidence. Authentication includes removable local
development identities; use [the setup/removal guide](docs/local-development-auth.md).

## Agent skills

### Issue tracker

Issue-tracker conventions use GitHub and the authenticated `gh` CLI. Local
`docs/github_issues*.md` files are historical planning snapshots, not verified
live issue state. See [issue-tracker conventions](docs/agents/issue-tracker.md).

### Triage labels

Triage roles are mapped to default GitHub labels (e.g. needs-triage, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

The repository uses a single-context domain layout (CONTEXT.md at root). See `docs/agents/domain.md`.
