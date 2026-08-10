# Windows installer modernization

## Goal

Replace FyAgent's Windows MSI/WiX distribution with native x64 and ARM64
per-machine NSIS setup executables while preserving runtime security and user
data.

## Requirements

- Windows bundles only NSIS; other platform bundle targets remain unchanged.
- Provide English/Simplified Chinese OS-selected setup, WebView2 download
  bootstrapper, `/S`, and final `/D=<install path>` support.
- Use the standard NSIS directory-selection behavior without a FyAgent-owned
  absolute/fixed/local/UNC/reparse/drive-type admission gate. NSIS/Windows
  parsing and actual write failures remain authoritative.
- Use the canonical `icons/icon.ico` for both setup and uninstaller surfaces.
- Remove only MSI/WiX implementation, assets, tests, and workflow contracts;
  retain formal `requireAdministrator`, test manifest, activation security,
  and explicit all-users behavior.
- Uninstall removes installer-owned state while preserving user data.
- Formal signing is provider-neutral and optional: an absent selector with
  fully absent provider configuration, or the explicit `unsigned` selector,
  requires strict `NotSigned` evidence and public disclosure; complete
  configuration requires valid post-sign publisher/timestamp verification;
  partial/invalid configuration fails closed. On GitHub-hosted runners,
  provider-specific adapter bytes and any opaque credential are supplied only
  through secrets, materialized for the signing step, and removed afterward.
- The dependency/Cargo/Tauri build runner never receives signer configuration
  or secrets. After every platform build, a secret-free job verifies all ten
  pre-signer artifact directories, binds each file's size/SHA-256/version/source
  SHA into one immutable-ID bundle, and makes every later consumer use that old
  ID. Dispatch hands the pinned strict unsigned raw candidate to a secret-free
  preflight sealer. Formal tags instead use a secret-bearing producer that may
  transform only an untrusted candidate and then ends; a separate fresh,
  secret-free native sealer compares it with the frozen raw bytes, independently
  proves the signature policy, generates the trusted fragment, and owns the
  final installer artifacts. Exact asset verification consumes the resulting
  immutable sealed pair directly; Release does not execute an elevated native
  install/verify/uninstall lifecycle.

## Acceptance Criteria

- [ ] Windows outputs are exactly versioned x64/ARM64 setup EXEs with no MSI.
- [ ] Native x64 and ARM64 runners successfully build and package the matching
      setup executable.
- [ ] GUI and silent `/D` installation retain standard NSIS path behavior and
      tests prove the absence of a FyAgent custom path-admission policy.
- [ ] Setup and uninstaller use the canonical FyAgent icon.
- [ ] WebView2, language, elevation, uninstall ownership, asset naming, signing
      state, disclosure, and attestation contracts pass automatically.
- [x] Tests prove the five-stage preflight and six-stage formal trust chains,
      immutable-ID pinning of every pre-signer platform artifact,
      exact one-file artifact handoffs, secret-free build/preflight/sealer/
      verification jobs, untrusted formal-producer output, independent
      signature proof, exact success/skip admission, direct sealed-asset
      verification, and absence of a Release lifecycle job or evidence
      replacement.
