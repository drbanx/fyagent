# Technical design

## 1. Authority and migration shape

This task is a directed architecture replacement on top of the existing NSIS
and release trust chain. It does not reopen or rewrite archived work. The
current task artifacts and updated active specs become authority for the
changed contracts; retained behavior continues to use existing owners.

The migration has three independent but ordered planes:

1. Remove FyAgent-specific Trellis/mise enforcement while retaining upstream
   Trellis files as optional assistance.
2. Replace the Windows machine-runtime/equal-user model with an immutable
   Shell-user context and a narrow Shell-user package helper.
3. Promote real Windows installer lifecycle execution into CI and release
   admission without weakening release artifact identity or permissions.

The implementation is intentionally split into nine commits so any plane can
be reviewed or reverted at its ownership boundary.

## 2. Tooling boundary

### Retained

- `mise` remains the repository's developer task runner for bootstrap,
  environment checks, development, formatting, tests, contracts, and release
  checks.
- `.trellis/**`, `AGENTS.md`, upstream agents/skills/hooks, archived tasks, and
  journals remain available.
- The upstream Codex hooks continue to inject workflow breadcrumbs and
  task-local context when their generic runtime state is available.

### Removed

- `.mise/tasks/trellis.toml` inclusion and `scripts/tasks/trellis.mjs`.
- Overlay manifest, transform assets, reconciliation and verification scripts,
  overlay-owned tests, and CI/check dependencies.
- Project-local `fyagent-trellis` skill, Codex hook runner/mise hook tasks, and
  bootstrap-time prompt preparation/injection.
- Tests and docs asserting that contribution, build, CI, or release require a
  Trellis task/spec/CLI or forbid direct bundled task scripts.

After the decoupling commit, this active task uses the retained upstream
scripts directly for lifecycle operations. No new wrapper or long-term project
API is introduced.

## 3. Frozen Windows interactive-user context

`WindowsInteractiveUserContext` is created once during process initialization
before any component derives a user path. It contains:

```text
process_session_id
shell_session_id
canonical_sid
user_profile
user_local_app_data
user_roaming_app_data
```

Resolution uses the Explorer Shell window/process/token for identity and
Windows token/profile-known-folder APIs for paths. The process token remains
relevant only for privilege and diagnostic facts. It does not select the user.

The context is immutable and internal. Services receive references/clones of
the frozen value rather than querying ambient environment on demand. A live
side-effect boundary may re-prove that the current Shell token still matches
the frozen session/SID, but it cannot replace the context with another user.

Initialization outcomes:

- same process/Shell user: continue with the Shell paths;
- elevated Bob with Shell Alice: continue with Alice's paths and SID;
- absent Shell, token/profile lookup failure, noncanonical SID, or known-folder
  failure: fail explicitly before reading/writing user state;
- non-Windows: preserve existing path and single-instance behavior.

Panic logging must have an explicit early-failure destination that does not
pretend an ambient process path is user state. Once the Shell context exists,
panic logs, configuration, databases, provider state, tray state, and all
other FyAgent per-user paths use it.

## 4. Windows single-instance boundary

The Windows custom runtime state/lease/capability pipe is deleted. The existing
Tauri single-instance plugin is registered uniformly. Its callback enters the
same bounded argument normalizer used by the existing deep-link/lightweight/
focus flow.

The callback is an untrusted request boundary because the plugin's predictable
local mutex/window transport is not an application capability. It may request
only:

- parse and surface an allowlisted deep link through the established guarded
  confirmation flow;
- open the lightweight window through existing rules;
- focus/show the current window when no actionable argument exists.

It cannot invoke the helper, PackageManager, elevated cleanup, or arbitrary
filesystem operations. Count, item-size, aggregate-size, control-character,
scheme/version/action, and deep-link DTO validation all precede behavior.

## 5. Helper process and IPC

### Binary boundary

`fyagent-user-helper.exe` is a separate Windows binary target with an
`asInvoker` manifest and minimal dependencies. It does not construct Tauri or
expose the renderer command table.

The CLI parser accepts one action and exactly two named values. `job-id` is a
canonical UUID. `pipe` is exactly 64 lowercase hexadecimal characters. Duplicate,
missing, unknown, positional, option-like, or oversized values are rejected.

The helper derives:

```text
install_root = parent(current_exe())
msix = install_root/cache/codex-installer/<job-id>/installer.msix
pipe_name = fixed_prefix + nonce
```

No input can replace the executable, install root, package path, or operation.

### Launch and identity

The elevated main process reuses the existing Explorer COM launch boundary to
start the fixed helper path as the frozen Shell user. It does not use headless
runas, a generic command line, or a parent-owned control file.

The parent owns one named-pipe server created before launch with:

- local-only and first-instance flags;
- a descriptor granting the frozen Shell SID plus SYSTEM/Administrators only;
- a fixed prefix and a cryptographically random 256-bit nonce;
- one accepted connection, bounded timeout, and handle destruction afterward.

After connection, the parent resolves the pipe client PID, opens its token,
and requires the canonical token SID to equal the frozen Shell SID. The helper
also verifies it connected to the expected one-shot server shape where the
platform APIs permit it. No message is processed before identity admission.

### Protocol

The wire format is versioned and length-prefixed with a small absolute frame
cap. The only variants are:

```text
started
progress { completed: 0..100 }
success
error { code: bounded_enum, message: bounded_redacted_text }
```

Unknown versions/variants, duplicate terminal frames, progress regression,
trailing bytes, oversized lengths, malformed UTF-8, timeout, early exit, or a
second client fail the operation. Errors exposed to the renderer continue
through the existing structured/redacted installer error surface.

The helper calls `PackageManager.AddPackageByUriAsync` for its own current user
only. There is no Stage/Provision/all-user API.

## 6. Staging and byte-identity continuity

The main process derives the install root from its own verified executable,
then creates only this hierarchy:

```text
<install-root>/cache/codex-installer/<uuid>/installer.msix.part
<install-root>/cache/codex-installer/<uuid>/installer.msix
```

Every ancestor/leaf is checked as a normal non-reparse object. Cleanup accepts
only canonical UUID children and known fixed names; unknown entries are left
alone and reported diagnostically. No recursive delete owns the install root
or an unknown cache subtree.

The free-space probe resolves the volume containing the real install root.
Failure to resolve/query/write that root is terminal; it never substitutes a
drive letter.

After download and full package validation, the parent opens the final MSIX
with `GENERIC_READ` and only `FILE_SHARE_READ`. It obtains volume serial, file
index, and size through the handle, compares them with the verified file, and
keeps the handle live until the helper reports a terminal PackageManager
result and exits. Windows share-mode enforcement blocks later write/delete/
rename opens while still allowing the helper's read. This closes the path
replacement window without adding ACL semantics or a second helper hash pass.

The failure matrix explicitly covers a pre-existing incompatible write handle,
replacement/rename/delete attempts, handle identity drift, helper timeout, and
parent cancellation. The parent releases the pin only after the install
operation can no longer consume the path.

## 7. NSIS lifecycle and legacy cleanup

The checked-in NSIS template retains standard `perMachine` directory selection
and the dual main-manifest model. It no longer calls or requires ProgramData
runtime bootstrap. It packages the helper and its manifest, registers the main
application/shortcuts/protocol as before, and performs allowlisted uninstall.

Legacy cleanup is isolated from admission:

- known old runtime state/lease files and empty known directories may be
  removed best-effort;
- reparse points, unknown names, access errors, and nonempty ancestors are
  preserved;
- cleanup failure never aborts installation/uninstallation and never triggers
  recursive repair.

The native harness owns each installation case in a unique root. For D-drive
cases it either uses a pre-existing runner `D:` without changing it or creates
one temporary VHD/VHDX with a unique path, initializes only the new image, and
registers finally-style detach/delete cleanup. A mounted or image-identity
drift fails without touching another disk.

The upgrade source is frozen in repository data by public release tag, asset
ID, name, size, and SHA-256. The harness downloads by immutable asset identity,
checks every field and digest, then installs it before upgrading with H1's
setup.

## 8. CI and release evidence topology

CI's native Windows matrix builds/packages and executes the final setup and
uninstaller on x64 and ARM64. The release workflow keeps build, immutable pin,
preflight/formal proof/sealing, verification, attestation, and publication
ownership intact, and adds smoke as a consumer:

```text
native build -> immutable input pin -> preflight proof or formal fresh seal
             -> immutable sealed candidate -> secret-free native smoke
             -> verify-assets -> attest -> publish (formal tag only)
```

Each smoke job has `contents: read`, no secrets or elevated release permission,
and checkout credentials disabled. It downloads the exact upstream artifact
ID/digest, verifies the manifest/digest before execution, emits evidence, and
cannot upload a replacement candidate. x64 and ARM64 smoke must both succeed.

Dispatch mode continues through unsigned proof, smoke, asset verification, and
attestation. Formal signer/sealer jobs and publish are skipped by existing mode
conditions. The subject allowlist stays thirteen and the attachment allowlist
stays fourteen; smoke evidence is admission metadata, not another public
release attachment unless the existing metadata schema is explicitly extended
without changing that count.

## 9. Compatibility and rollback

- Web/API/database and renderer current-user semantics remain stable.
- macOS/Linux path and single-instance behavior remain stable.
- Reverting tooling commits restores only project enforcement, not product
  runtime behavior.
- Reverting Windows runtime/helper/staging commits must be done as an ordered
  group because their deleted machine-runtime assumptions are incompatible
  with the new Shell-user flow.
- CI/release smoke can be reverted independently if it proves platform
  infrastructure is unusable, but native evidence then remains unfulfilled and
  the candidate cannot be accepted.
- No rollback moves a remote tag, rewrites history, or publishes an alternate
  asset.

## 10. Security decisions

- Official Trellis `0.6.14` hooks are accepted with their weaker path/import/
  input/escaping protections; do not describe them as hardened.
- Single-instance activation is untrusted and cannot cross a privileged
  side-effect boundary directly.
- Helper authority is reduced by a fixed executable/action/path plus Shell SID
  authentication and one-shot pipe semantics.
- Verified MSIX bytes remain pinned by an open share-restricting handle until
  PackageManager finishes.
- Install-root ACLs remain a user-selected/Windows concern; the application
  adds no new staging ACL or owner policy.
- Release smoke cannot share signer secrets or mutate trusted artifacts.
