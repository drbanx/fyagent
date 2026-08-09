# FyAgent Windows installer flow

FyAgent's Windows distribution is built as architecture-specific NSIS setup
executables on matching native Windows runners. The normative path, privilege,
signing, uninstall, and lifecycle rules live in the
[Windows installer spec](../../../../.trellis/spec/backend/windows-installer.md).

## Build and evidence flow

```text
canonical application version
  -> Windows-only Tauri configuration
  -> NSIS pre-install path validation
  -> architecture-specific setup executable
  -> signing-policy transform or unsigned proof
  -> post-transform digest and signature verification
  -> native install / verify / uninstall lifecycle
  -> aggregate release metadata and attestation
```

The shared validator observes the final installation directory before the
installer writes application files. Interactive directory selection and silent
installation therefore reach the same decision point. Its purpose is to admit
an absolute path on a local fixed drive; it is not an ACL, directory-owner, or
protected-folder security classifier.

The installer owns its known application payload, shortcuts, registration,
uninstaller, and empty-directory cleanup. It does not recursively own the
installation directory: unrelated files beside the known payload survive.
Application database, configuration, OAuth, backup, and other user state have
separate runtime owners and must survive uninstall.

## Where to inspect

- `src-tauri/tauri.windows.conf.json` selects the Windows bundle surface.
- `src-tauri/nsis/` contains the repository-owned NSIS integration.
- `scripts/release/` contains signing, asset, and lifecycle evidence helpers.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml` run the
  matching-architecture native gates.
- `tests/windowsNsisContract.test.ts` and the release-contract suites provide
  portable policy coverage; native runner jobs provide actual installer
  evidence.

Use the [validation guide](../validation.md) to distinguish local contract
checks from native package acceptance.
