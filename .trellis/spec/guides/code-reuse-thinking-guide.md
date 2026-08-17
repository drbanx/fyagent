# Code Reuse Thinking Guide

> **Purpose**: Stop and think before creating new code - does it already exist?

---

## The Problem

**Duplicated code is the #1 source of inconsistency bugs.**

When you copy-paste or rewrite existing logic:

- Bug fixes don't propagate
- Behavior diverges over time
- Codebase becomes harder to understand

---

## Before Writing New Code

### Step 1: Search First

```bash
# Search for similar function names
rg -n "functionName" <relevant-paths>

# Search for similar logic
rg -n "keyword" <relevant-paths>
```

### Step 2: Ask These Questions

| Question                                       | If Yes...                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Does a similar function exist?                 | Use or extend it                                                  |
| Is this pattern used elsewhere?                | Follow the existing pattern                                       |
| Could this be a shared utility?                | Create it in the right place                                      |
| Am I copying leftover `src/` UI into `src/v2`? | **STOP** — reuse V2 shared/widgets; read [V2 Shell](../frontend/v2-shell.md) |
| Am I copying code from another file?           | **STOP** - extract to shared                                      |

---

## Common Duplication Patterns

### Pattern 1: Copy-Paste Functions

**Bad**: Copying a validation function to another file

**Good**: Extract to shared utilities, import where needed

### Pattern 2: Similar Components

**Bad**: Creating a new component that's 80% similar to existing

**Good**: Extend existing component with props/variants

### Pattern 3: Repeated Constants

**Bad**: Defining the same constant in multiple files

**Good**: Single source of truth, import everywhere

### Pattern 4: Repeated Payload Field Extraction

When two or more consumers read the same Tauri, event, or configuration payload
field, first locate the existing owner: a V2 feature port, a legacy API facade,
a domain type, or a schema. Put shared decoding there instead of another local
cast. For the wire-contract rules, read
[Frontend Type Safety](../frontend/type-safety.md); for V2 placement, read
[V2 Shell](../frontend/v2-shell.md).

---

## When to Abstract

**Abstract when**:

- Same code appears 3+ times
- Logic is complex enough to have bugs
- Multiple people might need this

**Don't abstract when**:

- Only used once
- Trivial one-liner
- Abstraction would be more complex than duplication

---

## After Batch Modifications

When you've made similar changes to multiple files:

1. **Review**: Did you catch all instances?
2. **Search**: Run `rg` to find any missed
3. **Consider**: Should this be abstracted?

### Reducers Should Use Exhaustive Structure

When state is derived from action-like values (`action`, `kind`, `status`,
`phase`), prefer one reducer over scattered `if/else` updates so the transition
table stays in one place. Display code should not re-implement pieces of that
table. For renderer state ownership, read
[State Management](../frontend/state-management.md).

---

## Checklist Before Commit

- [ ] Searched for existing similar code
- [ ] No copy-pasted logic that should be shared
- [ ] No repeated untyped payload field extraction outside a shared decoder
- [ ] Constants defined in one place
- [ ] Similar patterns follow same structure
- [ ] Reducer/action transitions live in one reducer or command dispatcher
