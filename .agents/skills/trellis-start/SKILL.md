---
name: trellis-start
description: "Initializes an AI development session by reading workflow guides, developer identity, git status, active tasks, and project guidelines from .trellis/. Classifies incoming tasks and routes to brainstorm, direct edit, or task workflow. Use when beginning a new coding session, resuming work, starting a new task, or re-establishing project context."
---

# Start Session

Initialize a Trellis-managed development session. This platform has no session-start hook, so manually load the equivalent compact context by following these steps.

---

<!-- fyagent:new-checkout-environment-gate:start -->

## Step 0: New checkout environment gate

Before this skill runs a repository task in a new checkout, a human developer
must explicitly review `mise.toml`, the included `.mise/tasks/*.toml` files,
the standard version files, and `mise.lock`, then manually run this sequence in
order:

```bash
mise trust
mise run bootstrap
mise run system:check
```

This gate is not automatic. Skills, hooks, and repository tasks must not automatically invoke `mise trust` or trigger `mise run bootstrap`; `bootstrap` runs only as the top-level command explicitly entered by the developer. If the gate is incomplete, stop and ask the developer to complete it instead of continuing to Step 1.

<!-- fyagent:new-checkout-environment-gate:end -->

## Step 1: Current state

Identity, git status, current task, active tasks, journal location.

```bash
mise run trellis:context
```

If this output includes a line beginning `Trellis update available:`, copy the full line verbatim when summarizing session context. Do not shorten operational command hints.

## Step 2: Workflow overview

Compact Phase Index, request triage rules, planning artifact contract, and the step-detail command.

```bash
mise run trellis:context -- --mode phase
```

Full guide in `.trellis/workflow.md` (read on demand).

## Step 3: Guideline indexes

Discover packages + spec layers, then read each relevant index file.

```bash
mise run trellis:context -- --mode packages
cat .trellis/spec/guides/index.md
cat .trellis/spec/<package>/<layer>/index.md   # for each relevant layer
```

Index files list the specific guideline docs to read when you actually start coding.

## Step 4: Decide next action

From Step 1 you know the current task and status. Check the task directory:

- **Active task status `planning` + no `prd.md`** → Phase 1.1. Load the `trellis-brainstorm` skill.
- **Active task status `planning` + `prd.md` exists** → stay in Phase 1. Lightweight tasks can be PRD-only; complex tasks need `design.md` + `implement.md`. Load the relevant Phase 1 step detail before `task.py start`.
- **Active task status `in_progress`** → Phase 2 step 2.1. Load the step detail:
  ```bash
  mise run trellis:context -- --mode phase --step 2.1 --platform codex
  ```
- **No active task** → classify first. For simple conversation / small task, ask only whether this turn should create a Trellis task. For complex work, ask whether you may create a Trellis task and enter planning. If the user says no, skip Trellis for this session.

---

## Skill routing (quick reference)

| User intent                           | Skill                 |
| ------------------------------------- | --------------------- |
| New feature / unclear requirements    | `trellis-brainstorm`  |
| About to write code                   | `trellis-before-dev`  |
| Done coding / quality check           | `trellis-check`       |
| Stuck / fixed same bug multiple times | `trellis-break-loop`  |
| Learned something worth capturing     | `trellis-update-spec` |

Full rules + anti-rationalization table in `.trellis/workflow.md`.
