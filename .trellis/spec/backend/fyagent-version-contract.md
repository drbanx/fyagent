# FyAgent Application Version and Installer Asset Contract

## 1. Scope / Trigger

Read this contract before changing the application version, formal release tag,
installer names, download manifest, build metadata, or any script that updates
Cargo version metadata.

FyAgent has one manually maintained application-version source. Release jobs
freeze that value together with a tag and source commit before any platform
build starts. Installer filenames use the unprefixed application version; they
never derive a second version from a Git ref or package-manager manifest.

This contract does not authorize creating or moving a Git tag, publishing a
Release, changing a toolchain, or rewriting historical release records.

## 2. Canonical Metadata

```toml
[workspace]
members = ["."]
resolver = "2"

[workspace.package]
version = "X.Y.Z"

[package]
name = "fyagent"
version.workspace = true
```

- `src-tauri/Cargo.toml [workspace.package].version` is the only manually
  maintained application-version literal.
- The workspace contains exactly the root package. Removed installer helper
  crates must not remain as workspace members or local lockfile packages.
- `package.json` is private and does not declare an application version.
- `src-tauri/tauri.conf.json` omits `version`, so Tauri inherits Cargo
  metadata.
- `src-tauri/Cargo.lock` contains exactly one source-less local package block
  named `fyagent`, and its version equals the workspace version.

The accepted version grammar is stable SemVer `X.Y.Z`: no `v` prefix,
prerelease, build metadata, leading zero, or omitted component. Components use
Cargo's unsigned 64-bit SemVer range; installer- or packager-specific numeric
limits are not application-version authority.

Windows is a narrower release representation, not a second version authority.
Each numeric component must fit an unsigned 16-bit field (`0..65535`) before a
formal release asset name is accepted or Tauri invokes NSIS. The release and
NSIS contract gates compare decimal strings with `BigInt`; they never coerce a
component through JavaScript `Number`. A canonical Cargo version outside this
range remains valid application metadata but cannot produce a Windows-inclusive
FyAgent Release until the canonical version changes.

## 3. Version Command Interface

```text
mise run version:get
mise run version:check [-- --tag vX.Y.Z]
mise run version:set -- X.Y.Z [--apply]
mise run version:bump -- patch|minor|major [--apply]
```

- `get` prints only the canonical stable version.
- `check` validates the complete metadata/lock contract. With `--tag`, it
  accepts exactly `v` plus the canonical version.
- `set` and `bump` preview by default. `--apply` is the only project-level
  write authorization.
- A write changes only `src-tauri/Cargo.toml` and the `fyagent` block in
  `src-tauri/Cargo.lock`. It must not rewrite dependencies, package.json,
  Tauri configuration, release workflow, docs, tags, or assets.
- Each target uses a unique same-directory temporary file, complete write,
  `fsync`, close, and rename. If a later write or post-write contract check
  fails, every already replaced target is restored through the same atomic
  replacement path and temporary files are removed.
- The two files are not one power-loss-atomic filesystem transaction. A crash
  between renames can leave detectable version drift; a later structurally
  valid `--apply` may repair only the canonical and local-lock values.

## 4. Frozen Release and Asset Values

The release eligibility boundary is the sole producer of:

```text
app_version = canonical Cargo version
release_tag = "v" + app_version
source_sha  = lowercase full Git commit SHA
release_mode = preflight | formal
```

Every platform, evidence, attestation, and publication step consumes those
outputs unchanged. A downstream step must not trim `GITHUB_REF_NAME`, reread a
different version field, or substitute another source SHA.

The installer allowlist contains exactly ten versioned files:

```text
FyAgent-X.Y.Z-macOS.dmg
FyAgent-X.Y.Z-macOS.zip
FyAgent-X.Y.Z-Windows-x64-setup.exe
FyAgent-X.Y.Z-Windows-arm64-setup.exe
FyAgent-X.Y.Z-Linux-x86_64.AppImage
FyAgent-X.Y.Z-Linux-x86_64.deb
FyAgent-X.Y.Z-Linux-x86_64.rpm
FyAgent-X.Y.Z-Linux-arm64.AppImage
FyAgent-X.Y.Z-Linux-arm64.deb
FyAgent-X.Y.Z-Linux-arm64.rpm
```

MSI, WiX, Windows portable ZIP, v-prefixed filenames, architecture aliases,
and unversioned installer names are not accepted release assets.

`download-manifest.json` schema `fyagent-download-manifest/v2` binds product,
version, tag, source SHA, publication time, and each installer's exact name,
platform, architecture, format, size, SHA-256, and URL. It rejects missing,
extra, nested, empty, symlinked, wrong-version, or malformed files.

`build-metadata.json` independently binds the five target groups, actual
toolchains, repository/workflow identity, source SHA, release mode, and
requested versus observed native environments. Windows and macOS record
`container: null`; Linux additionally binds its configured container digest
and observed OS/architecture.

`signing-status.json` binds both final Windows setup executables to the same
version/source SHA and to their post-sign SHA-256/size plus verified
Authenticode state. It is a release attachment and attestation subject; native
per-architecture signing fragments are private workflow inputs and are never
published.

The attestation subject set is the ten installers plus the download manifest,
build metadata, and signing status. The Sigstore bundle is the final Release
attachment and does not attest itself.

## 5. Change and Failure Rules

| Condition                                                                                              | Required result                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Workspace member, resolver, inherited version, private package flag, or duplicate version field drifts | `version:check` fails before release or version writes.                                        |
| Version is not stable `X.Y.Z`                                                                          | `get`, `set`, `bump`, or `check` fails without writes.                                         |
| A component exceeds `65535` while entering a Windows bundle or formal Release                          | The NSIS/release contract fails before packaging; the canonical Cargo value is not rewritten.  |
| Local `fyagent` lock block is missing, duplicated, sourced, or mismatched                              | `version:check` fails; `set` may repair only version drift after every other preflight passes. |
| Tag differs from `v` plus the canonical version                                                        | Eligibility/version checking fails before platform builds.                                     |
| An asset contains a v-prefixed, wrong, or missing version                                              | Platform or aggregate validation rejects it.                                                   |
| Installer, metadata, signing status, or attestation subject set is missing or has extras               | Evidence generation/publication stops.                                                         |
| A write fails after one canonical file was replaced                                                    | Restore all touched files, remove temporary files, and fail with rollback evidence.            |

## 6. Tests Required

- Node version tests cover get/check/set/bump, stable SemVer rejection,
  preview/apply, structural preflight, exact tag equality, local lock drift,
  duplicate/missing metadata, CRLF preservation, unique temporary files, and
  rollback after write or post-write failure.
- `tests/versionConsistency.test.ts` delegates to the canonical script rather
  than implementing another version parser.
- Download/release asset tests assert all ten exact names, Windows NSIS EXE
  architecture mapping, URL shape, no MSI, and missing/extra/symlink rejection.
- Release tests assert frozen output consumption and that the download,
  build, signing, attestation, and publication stages use the same version and
  source SHA.
- Windows release tests accept `65535`, reject `65536`, and use an integer path
  that also rejects values beyond JavaScript's safe-number range without
  truncation.

Safe local checks are run through the repository toolchain:

```bash
mise run version:check
mise exec -- node --test tests/version.test.mjs
mise run test:unit -- tests/versionConsistency.test.ts \
  tests/downloadManifest.test.ts tests/releaseAssets.test.ts
mise run release:check
```

Native installer/signing evidence remains owned by the Windows release
boundary. Local static tests do not establish an x64 or ARM64 installer,
Authenticode state, installation lifecycle, attestation, or public Release.

## 7. Wrong vs Correct

Wrong:

```text
package.json.version = "X.Y.Z"
tauri.conf.json.version = "X.Y.Z"
GITHUB_REF_NAME is stripped and reused as an installer version
FyAgent-vX.Y.Z-Windows.msi
```

Correct:

```bash
mise run version:set -- X.Y.Z --apply
mise run version:check -- --tag vX.Y.Z
```

Then eligibility freezes the canonical version, tag, source SHA, and release
mode once; every platform and evidence step consumes those exact values.
