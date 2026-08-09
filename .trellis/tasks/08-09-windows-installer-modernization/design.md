# Design

Windows-specific JSON merge configuration selects only the NSIS target and
owns per-machine, language, WebView2, and hook settings. A minimal documented
NSIS pre-install hook validates the final `$INSTDIR` before writes; custom
template ownership is permitted only if a failing fixture proves hooks cannot
express the shared GUI/CLI gate.

The release pipeline deterministically renames native Tauri outputs to
`FyAgent-<version>-Windows-x64-setup.exe` and
`FyAgent-<version>-Windows-arm64-setup.exe`. Signing produces a per-asset
machine-readable status consumed by asset verification and release notes.
Exactly zero signer inputs selects the reviewed unsigned branch; any partial
input is an error rather than an unsigned fallback.
