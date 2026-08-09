# Implementation

1. Inventory MSI/WiX ownership and user-data paths; freeze keep/delete lists.
2. Add NSIS platform config and shared path-validation hook/harness.
3. Update Windows build, artifact collection, release-contract code, and tests
   to setup EXEs while leaving other platforms unchanged.
4. Delete MSI/WiX-only crate, configs, scripts, fixtures, and tests.
5. Add optional signer status/verification and release-note metadata.
6. Add x64/ARM64 native lifecycle jobs and negative path fixtures.
7. Run config/release/unit/Rust checks locally; retain native lifecycle gates
   for matching GitHub runners.
