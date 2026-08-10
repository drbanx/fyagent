# Windows runtime and Codex Desktop flow

Two security boundaries meet in the Windows Codex Desktop path:

- the host freezes the Explorer user's SID and Profile/LocalAppData/
  RoamingAppData before Tauri or any user-state consumer starts;
- Codex Desktop services and platform adapters own trusted-package discovery,
  installation/update, post-verification, restart, and launch for that frozen
  user.

Retained runtime-security and Codex Desktop installer notes under
`.trellis/spec/` are optional AI-assistance review material.

## Shell-user data flow

```text
process start
  -> current Explorer process and token
  -> freeze Shell session, canonical SID, Profile, LocalAppData, RoamingAppData
  -> initialize WebView/config/log/database/state on those paths
  -> explicit-SID Codex package discovery
  -> verify the fixed install-root MSIX and hold its file identity open
  -> launch the fixed current-user helper through Explorer
  -> authenticated one-shot progress/result pipe
  -> post-verification and launch for the same frozen context
```

An administrator named Bob may approve UAC while Alice owns the Explorer
Shell. FyAgent continues in that case and treats Alice as the user: it does not
fall back to Bob's profile, `HKCU`, process environment, SYSTEM, the current
directory, or a default drive. If the Shell user or one of the required known
folders cannot be resolved, startup fails before user data is read or written.

Windows supplies explicit Alice-owned paths for the WebView2 data directory,
application-path Store, window state, configuration, logs, and database. The
same LocalAppData projection owns transient database, provider hand-off, sync,
and skill-processing files instead of the elevated process temp directory. The
application builds only the configured `main` window manually so Tauri cannot
derive its WebView path from the elevated account; lightweight-mode recreation
uses the same path. A later Shell identity drift stops the next protected side
effect rather than selecting a different user.

The Windows single-instance plugin is coordination, not authentication. Its
callback bounds the complete argument envelope and validates deep links before
it can restore lightweight mode, emit a confirmation request, or focus the
window. Callback input never starts package installation, a helper, cleanup,
an elevated file operation, or an arbitrary command/path. The pinned plugin's
Windows transport still decodes local `WM_COPYDATA` before the callback and
does not authenticate the peer; keeping the callback non-privileged is the
required containment for that accepted residual dependency risk.

Official Codex Desktop packages on Windows are MSIX packages. That package
format belongs to the software FyAgent manages and is independent of the NSIS
format used to install FyAgent itself.

## Current-user helper boundary

FyAgent packages a Windows-only `fyagent-user-helper.exe` with its own
`asInvoker` manifest and no Tauri UI/runtime dependency. It accepts only this
fixed command shape:

```text
fyagent-user-helper.exe codex-msix-install --job-id <canonical-lowercase-uuid> --pipe <64-lowercase-hex>
```

The helper derives both its install root and
`cache\codex-installer\<job-id>\installer.msix` from `current_exe()`. It does
not accept an executable, command, URI, package path, installer scope, or
validation bypass. Its only deployment operation is current-user
`PackageManager.AddPackageByUriAsync`; the retired headless/runas control and
job files, all-users DTOs, Stage, and Provision operations have no replacement.

The elevated parent creates one local first-instance pipe before asking
Explorer to launch the fixed sibling helper as Alice. The pipe name uses the
session-local `LOCAL\` namespace and combines a versioned fixed prefix with a
random 256-bit nonce. Its descriptor gives Alice
only write-data plus synchronize access. SYSTEM and Administrators have only
`READ_CONTROL`, not pipe data, synchronize, DACL-write, or owner-write access, so a helper
running under either broad principal cannot connect and start PackageManager.
The parent reads one bounded raw frame only to make pipe impersonation
available, then verifies the connected PID's process and impersonated-token
SID/session plus the pinned helper image before decoding that frame. The server
accepts one connection and is destroyed on identity failure, timeout, early
exit, or completion. Explorer COM launch waiting is itself bounded and admits
only one in-flight helper launch, so a late launch finds no server and exits
before PackageManager.

Messages are versioned and length-prefixed under a small absolute cap. The
only states are `started`, strictly increasing bounded `progress`, one
`success`, or one structured bounded `error`. Unknown/trailing/oversized data,
invalid UTF-8, progress regression, a missing start, or a duplicate terminal
message fails the installation.

## Safe activation sequence

The helper/protocol/Explorer/pipe batch deliberately lands as unreachable
scaffolding while the production Windows installer path fails closed. It must
not make an interim copy from the old system-temp staging path into the
helper's fixed location: that would break the byte identity proven by the
elevated verifier.

The following staging-and-pin batch activates the helper atomically with the
install-root cache and an open `GENERIC_READ + FILE_SHARE_READ` handle whose
volume serial, file index, and size have been rechecked. The parent holds that
handle until PackageManager and the helper reach a terminal result, preventing
write, delete, or rename between verification and Alice's consumption. This
ordering is also the rollback boundary: helper activation and the file pin
must not be separated. A parent-side pipe timeout alone is not a safe release
condition; progress-write failure, handler-registration failure, timeout, and
early disconnect must cancel and observe the WinRT operation, or transfer the
pin to an owner that retains it until helper/PackageManager completion.

## Testing boundary

Portable Rust and frontend fixtures cover same-user and Bob/Alice identity,
missing Shell/folder failures, immutable context propagation, backend-owned
directory defaults, single-instance input limits, and context-bound package
inventory. Helper tests cover the exact CLI/layout, protocol bounds and order,
minimal pipe access, AddPackage-only runtime, independent `asInvoker` manifest,
and the fail-closed activation gate. Static contracts ensure Windows
production paths do not derive user state from ambient profile/app-data/
tool-home variables or `HKCU`.

Matching x64 and ARM64 native Actions jobs own evidence for the Explorer token,
UAC, WebView2 path, Windows registry, package manager, and final setup behavior.
Linux compilation, portable fixtures, and static contracts are useful local
evidence but do not substitute for those native Windows results.

The repository also intentionally accepts the official Trellis `0.6.14`
Codex hooks without FyAgent's former path-containment, exact-import,
session/input, and markup-escaping overlay checks. That separate prompt-hook
regression remains a documented residual risk; the helper security boundary
must not be presented as restoring equivalent hook hardening.
