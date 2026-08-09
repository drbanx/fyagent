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
- Formal signing is provider-neutral and optional: fully absent configuration
  requires strict `NotSigned` evidence and public disclosure; complete
  configuration requires valid post-sign publisher/timestamp verification;
  partial/invalid configuration fails closed.

## Acceptance Criteria

- [ ] Windows outputs are exactly versioned x64/ARM64 setup EXEs with no MSI.
- [ ] Native x64 and ARM64 runners complete install, verification, uninstall,
      and user-data-preservation lifecycle tests.
- [ ] Default, custom space/Unicode, silent, `/D`, and unsupported-drive cases
      prove the shared path policy.
- [ ] WebView2, language, elevation, uninstall ownership, asset naming, signing
      state, disclosure, and attestation contracts pass automatically.
