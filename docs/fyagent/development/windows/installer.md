# FyAgent Windows installer flow

FyAgent's Windows distribution is built as architecture-specific NSIS setup
executables on matching native Windows runners. The normative path, privilege,
signing, uninstall, and packaging rules live in the
[Windows installer spec](../../../../.trellis/spec/backend/windows-installer.md).

## Build and evidence flow

```text
canonical application version
  -> Windows-only Tauri configuration
  -> standard NSIS directory selection
  -> architecture-specific setup executable
  -> signing-policy transform or unsigned proof
  -> post-transform digest and signature verification
  -> aggregate release metadata and attestation
```

Interactive directory selection and a final silent `/D=` value use standard
NSIS handling. FyAgent does not add an absolute/fixed/local/UNC/reparse/
drive-type, ACL, directory-owner, or protected-folder admission rule for the
chosen installation directory. NSIS/Windows may still reject malformed input,
and an actual filesystem or registration write can still fail.

This product choice does not apply to the independent protected machine
runtime. `%ProgramData%\FyAgent\runtime` must still satisfy its exact owner/DACL
contract before application payload copy. The selected `$INSTDIR` does not
weaken or relocate that security boundary.

`icons/icon.ico` is the canonical Windows package icon. The Windows Tauri
configuration supplies it to the checked-in template, which uses it for both
the setup and uninstaller UI.

The installer owns its known application payload, shortcuts, registration,
uninstaller, and empty-directory cleanup. It does not recursively own the
installation directory: unrelated files beside the known payload survive.
Application database, configuration, OAuth, backup, and other user state have
separate runtime owners and must survive uninstall.

## Where to inspect

- `src-tauri/tauri.windows.conf.json` selects the Windows bundle surface.
- `src-tauri/nsis/` contains the repository-owned NSIS integration.
- `scripts/release/` contains signing and asset evidence helpers plus an
  optional manual lifecycle diagnostic.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml` run the
  matching-architecture build/package and release-evidence gates. Release does
  not run install/verify/uninstall lifecycle jobs.
- `tests/windowsNsisContract.test.ts` and the release-contract suites provide
  portable policy coverage; native runner jobs provide actual build/package
  evidence. `verify-windows-nsis-lifecycle.ps1` can be run manually for bounded
  install/uninstall diagnostics but is not a publication gate.

Use the [validation guide](../validation.md) to distinguish local contract
checks from native package acceptance.
