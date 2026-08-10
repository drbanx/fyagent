# Windows Runtime Security Contract

## 1. Scope / Trigger

Read this contract before changing formal Windows startup, privilege/identity
proof, `InteractiveUserContext`, the protected machine-runtime root, state or
lease files, single-instance activation, or the elevated command boundary. The
Windows installer owns when the runtime root is provisioned and how bounded
installer state is removed; this file owns the descriptor and runtime admission
rules that both installer and application must enforce. Ordinary Codex package
enumeration and installation consume this context under
[Codex Desktop Installer](./codex-desktop-installer.md).

## 2. Signatures

```rust
pub(crate) const fn formal_windows_build() -> bool;
pub fn early_windows_startup_gate() -> WindowsStartupDisposition;
pub fn runtime_privilege_status() -> RuntimePrivilegeStatus;
pub(crate) fn install_activation_handler<F>(handler: F)
    -> Result<(), WindowsStartupErrorCode>;
```

The internal immutable identity is:

```text
InteractiveUserContext {
  process_session_id,
  shell_session_id,
  canonical_sid,
}
```

It is generated once before Tauri construction, is never serialized to the
renderer, and is passed by identity through ordinary Windows package, process,
restart, and launch operations.

## 3. Contracts

### Formal startup and interactive identity

- `early_windows_startup_gate` executes before Tauri construction. A formal
  Windows release continues only when privilege status is available, elevated,
  locally administrative, and the process is proven to be the same interactive
  Shell user. Any unavailable or mismatched proof produces a stable blocked
  outcome.
- The sole ordinary proof path is process session/token SID ->
  `GetShellWindow` -> Shell PID -> Shell session -> Shell token SID -> exact
  process/Shell session and canonical SID equality. Missing Shell, lookup/token
  failure, session mismatch, or SID mismatch fails closed.
- `WTSQueryUserToken` is not part of ordinary GUI proof. Its LocalSystem and
  `SE_TCB_NAME` service contract must not be introduced as a fallback.
- Long-running operations may re-prove live process/Shell facts against the
  frozen context, but they never replace it with a newly discovered user.
  Development/test builds may continue when formal startup proof is unavailable;
  the ordinary Windows Codex adapter then remains unavailable.

### Protected machine-runtime root

- `%ProgramData%\FyAgent` and its `runtime` child are non-reparse directories
  with protected inheritance, Builtin Administrators owner, and only SYSTEM and
  Administrators inheritable full-control ACEs.
- Installer bootstrap creates a missing root atomically. An existing object is
  admitted only when a no-follow handle proves directory/non-reparse type and
  the exact owner/DACL. An unsafe preimage is rejected without repair or
  mutation.
- A trusted legacy runtime containing only bounded runtime state names may be
  retired through held handles and recreated atomically. Unknown content,
  reparse points, descriptor drift, or a handle that prevents bounded deletion
  fails closed.
- Every runtime root/state/lease open repeats no-follow type, canonical path,
  owner, and exact DACL admission. Narrow `SeRestorePrivilege` use is restored
  by RAII. Runtime code never treats lexical ProgramData placement as sufficient
  proof.
- Installer uninstall may remove only the documented runtime state/lease name
  patterns and then empty runtime ancestors. It must not recursively own other
  ProgramData content.

### Protected activation forwarding

- The state file supplies deterministic instance discovery only. A live pipe
  uses a fresh high-entropy name and a separate activation capability; neither
  may be replaced by a static pipe, mutex, PID, executable-name scan, or path
  guess.
- A client opens the pipe with `CreateFileW` and identification-only security
  quality-of-service, sends a bounded challenge, verifies the server HMAC, then
  sends the capability-bound request HMAC and bounded argv. It does not send
  argv before endpoint proof and does not use `CallNamedPipe`.
- The server authenticates client identity, validates the bounded frame and
  both proofs, then invokes the activation handler. Corrupt, stale, expired,
  trailing, unbounded, or unauthenticated input fails before activation.

### Elevated command boundary

In a formal elevated Windows release, tool-version probes and lifecycle
commands stop at the elevated CLI boundary before searching for or executing
user CLI tools. Development and test builds retain their ordinary-user
behavior. A renderer request cannot downgrade this gate or provide a process,
path, Shell identity, or capability secret.

## 4. Validation & Error Matrix

| Condition                                                                                   | Required result                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Formal process is not elevated/local-admin or privilege state is unavailable                | Return the stable blocked startup disposition before Tauri construction. |
| Shell is absent, belongs to another session/SID, or token lookup fails                      | Fail identity proof; do not use another API or user as fallback.         |
| Frozen context is absent or live proof drifts during a Codex operation                      | Stop before the next deploy, close, restart, or launch side effect.      |
| ProgramData root/state/lease is a reparse point, wrong object type, owner, or DACL          | Reject without repair or mutation.                                       |
| Legacy runtime contains an unknown name or cannot be retired through held handles           | Fail bootstrap and preserve the rejected preimage.                       |
| Activation challenge/HMAC/frame/identity is stale, malformed, unauthenticated, or oversized | Reject before forwarding argv or invoking the handler.                   |
| Formal elevated CLI reaches a user-tool search/exec path                                    | Block at the privilege gate.                                             |

## 5. Good / Base / Bad Cases

- Good: one process/Shell proof creates the frozen context; inventory,
  post-verify, restart, and launch all re-prove against it and reject owner drift.
- Base: a development build lacks a Shell proof. The app can continue under the
  documented development behavior, but ordinary Windows Codex capability is
  unavailable.
- Good: an existing exact runtime descriptor is admitted by no-follow handles;
  a bounded legacy state set is atomically retired and recreated.
- Bad: query another session token, select the newest user, repair an unsafe
  ProgramData ACL, trust a state-file pipe name without HMAC proof, or scan for
  a process by image name.

## 6. Tests Required

- Windows runtime unit tests cover privilege dispositions, process/Shell
  session/SID equality, missing Shell/token failures, immutable-context drift,
  and explicit absence of `WTSQueryUserToken` from the ordinary path.
- Descriptor tests cover owner/DACL predicates, protected inheritance,
  reparse/type rejection, exact legacy-name retirement, unknown content, held
  handle failures, and privilege restoration.
- Activation tests cover bounded frame encode/decode, control/trailing-data
  rejection, stale/tampered capabilities, server and request HMACs, client
  identity, and no argv before server proof.
- Static boundary tests prove formal elevated tool probes stop before user CLI
  lookup, while development/test behavior remains available.
- Matching x64 and ARM64 native Windows jobs prove application compilation,
  NSIS packaging, and startup-manifest integration. Runtime-root behavior is
  covered by its unit/static contracts and may be exercised with the manual
  installer lifecycle diagnostic; that harness is not a Release workflow gate.
  Non-Windows tests do not replace matching native build/package evidence.

## 7. Wrong vs Correct

Wrong:

```text
current user = first active WTS session
pipe identity = static name + PID
unsafe ProgramData descriptor = rewrite it and continue
```

Correct:

```text
process session/SID == Shell session/SID -> freeze InteractiveUserContext
no-follow handle + exact descriptor -> admit runtime object
challenge/server proof -> capability/request proof -> bounded activation
```
