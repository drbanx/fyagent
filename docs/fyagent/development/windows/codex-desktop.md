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
  -> current-user install/update boundary
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

## Testing boundary

Portable Rust and frontend fixtures cover same-user and Bob/Alice identity,
missing Shell/folder failures, immutable context propagation, backend-owned
directory defaults, single-instance input limits, and context-bound package
inventory. Static contracts ensure Windows production paths do not derive user
state from ambient profile/app-data/tool-home variables or `HKCU`.

Matching x64 and ARM64 native Actions jobs own evidence for the Explorer token,
UAC, WebView2 path, Windows registry, package manager, and final setup behavior.
Linux compilation, portable fixtures, and static contracts are useful local
evidence but do not substitute for those native Windows results.
