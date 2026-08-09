# Windows installer modernization

## Goal

Replace FyAgent's Windows MSI/WiX distribution with native x64 and ARM64
per-machine NSIS setup executables while preserving runtime security and user
data.

## Requirements

- Windows bundles only NSIS; other platform bundle targets remain unchanged.
- Provide English/Simplified Chinese OS-selected setup, WebView2 download
  bootstrapper, `/S`, and final `/D=<absolute path>` support.
- The shared final path gate accepts only valid absolute paths on local fixed
  drives and rejects relative, UNC/network, removable, optical, and RAM drives.
  It performs no ACL, owner, protected-folder warning, or hardening.
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
  final installer artifacts. A further fresh secret-free native runner
  byte-validates the sealed pair before the elevated lifecycle and cannot
  upload or overwrite downstream evidence.

## Acceptance Criteria

- [ ] Windows outputs are exactly versioned x64/ARM64 setup EXEs with no MSI.
- [ ] Native x64 and ARM64 runners complete install, verification, uninstall,
      and user-data-preservation lifecycle tests.
- [ ] Default, custom space/Unicode, silent, `/D`, and unsupported-drive cases
      prove the shared path policy.
- [ ] WebView2, language, elevation, uninstall ownership, asset naming, signing
      state, disclosure, and attestation contracts pass automatically.
- [ ] Tests prove the five-stage preflight and six-stage formal trust chains,
      immutable-ID pinning of every pre-signer platform artifact,
      exact one-file artifact handoffs, secret-free build/preflight/sealer/
      lifecycle jobs, untrusted formal-producer output, independent signature
      proof, exact success/skip admission, and absence of lifecycle uploads or
      evidence replacement.
