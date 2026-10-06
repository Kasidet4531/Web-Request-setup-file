# Frontend worker routing verification

Verified on 3 October 2026, Asia/Bangkok, before application implementation.

## Result

This Codex environment supports independent model and reasoning-effort settings on new subagent spawns. Three read-only workers were spawned with explicit `model: "gpt-6.1-sol"`, `reasoning_effort: "high"`, and `fork_turns: "none"`. The root independently read each worker's `session_meta` and latest `turn_context` record, matched its task path and parent thread, and confirmed the effective session settings below. Worker self-reports were consistent with those records, but were not the sole evidence.

| Agent | Effective model | Effective effort | Turn-context timestamp (UTC) |
| --- | --- | --- | --- |
| `/root` | `gpt-6.1-sol` | `ultra` | 2026-10-02T18:26:21.402Z |
| `/root/form` | `gpt-6.1-sol` | `high` | 2026-10-02T18:28:02.317Z |
| `/root/schema` | `gpt-6.1-sol` | `high` | 2026-10-02T18:28:12.293Z |
| `/root/admin` | `gpt-6.1-sol` | `high` | 2026-10-02T18:28:22.958Z |

The root's configuration also specifies `model = "gpt-6.1-sol"` and `model_reasoning_effort = "ultra"`. Root settings were not changed. All three workers performed metadata inspection only and are idle. No application code was edited.

## Available configuration and controls

- Client version in live session metadata: `0.159.2`.
- Four concurrent slots are exposed: root plus three active workers. Completed workers remain addressable.
- `collaboration.spawn_agent` accepts explicit `model` and `reasoning_effort` overrides. In this session, overrides require an isolated or partial-history fork; full-history forks inherit root settings. The actual tool schema takes precedence over conflicting skill examples.
- Advertised model choices are `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, and `gpt-5.6-luna`. Only `gpt-6.1-sol / high` was tested here; the other advertised routes were not tested.
- `followup_task` resumes an existing worker but exposes no model or effort override. `send_message` queues a message without starting a turn. Neither control should be treated as an effort-setting API.
- `list_agents` reports lifecycle status, not effective model or effort. Rollout metadata supplies the verification evidence.
- Global `~/.codex/config.toml` contains no `[agents]` routing defaults. No global `~/.codex/agents/` directory or project `.codex/` configuration exists. Explicit spawn settings therefore provide the routing for these workers.
- The exposed spawn schema has no `agent_type` role-file selector. No persistent configuration was changed.

Official documentation describes inheritance, explicit overrides, defaults, and custom-agent configuration: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents). Local runtime evidence establishes what actually worked in this session.

## Execution policy

1. Keep root on Ultra for orchestration, integration, architecture decisions, conflict resolution, and final review.
2. Assign the existing Form, Schema, and Admin file groups to `/root/form`, `/root/schema`, and `/root/admin`, respectively. Their model is `gpt-6.1-sol` and their effort is High.
3. Do not resume the previous audit workers for implementation: their session records show inherited Ultra settings.
4. Before each worker receives editing work, verify the latest session context still shows the intended route. Recheck after a resume, replacement spawn, or session reload. Record any mismatch and stop that worker's editing work until corrected.
5. For every replacement worker, set both model and effort explicitly with an isolated fork, verify the resulting session record, and give it only its exclusive files. Do not rely on prompt text to lower effort or on spawn acceptance alone to prove routing.
6. Keep Max/Ultra work at the root. Any exceptional worker escalation requires a concrete task reason documented before spawning and verification afterward. Routine Form, Schema, and Admin implementation remains High.
7. Workers must not create additional workers. Root controls delegation and file ownership.
8. Implementation remains gated by approval of the existing design specification, concepts, and implementation plan, followed by root shell and primitive completion. Routing verification does not authorize implementation.

## Local evidence

- [Root rollout](/Users/kasidetwatthanaphonphairot/.codex/sessions/2026/10/02/rollout-2026-10-02T23-56-00-01a0fd8b-4e72-78d3-8e83-a17ec65b4e37.jsonl)
- [Form rollout](/Users/kasidetwatthanaphonphairot/.codex/sessions/2026/10/03/rollout-2026-10-03T01-28-00-01a0fddf-88d4-7e22-8ef8-2e7dd8f5c6bb.jsonl)
- [Schema rollout](/Users/kasidetwatthanaphonphairot/.codex/sessions/2026/10/03/rollout-2026-10-03T01-28-10-01a0fddf-b168-79b3-83c2-02d6b0332d00.jsonl)
- [Admin rollout](/Users/kasidetwatthanaphonphairot/.codex/sessions/2026/10/03/rollout-2026-10-03T01-28-21-01a0fddf-da87-7a61-a526-3312fb5c6905.jsonl)

Only whitelisted configuration and session metadata fields were displayed during inspection. Instructions, message bodies, credentials, and other configuration values were not printed.

## Implementation and resume verification

The initial table above records the pre-implementation probe. The approved policy was then retained throughout implementation. Before editing turns and after resumes, root inspected whitelisted `turn_context` model/effort fields in the matching rollouts; task path and parent identity were matched from `session_meta`.

| Agent | Effective route on final resume | Latest context independently inspected (UTC) |
| --- | --- | --- |
| `/root` | `gpt-6.1-sol / ultra` | 2026-10-02T23:55:56.406Z |
| `/root/form` | `gpt-6.1-sol / high` | 2026-10-02T23:45:58.679Z |
| `/root/schema` | `gpt-6.1-sol / high` | 2026-10-02T23:56:57.906Z |
| `/root/admin` | `gpt-6.1-sol / high` | 2026-10-02T23:44:06.985Z |

Implementation-start contexts were also independently verified at 18:55:14.370Z (Form), 18:55:31.484Z (Schema) and 18:55:50.493Z (Admin) on 2 October UTC. Further resume checks at 23:37:44.771Z, 23:37:50.693Z and 23:37:59.584Z again confirmed High. The Schema final read-only audit explicitly reverified its 23:56:57.906Z context. No worker escalation or child spawn occurred. Root retained architecture, shared styling, integration, conflict resolution and final review.

All implementation work is complete. [Final verification ledger](2026-10-03-frontend-fidelity-ledger.md) records the delivered result. The configured backend remained stopped; routing verification is distinct from frontend and live-integration evidence.
