# Validation and evidence guide

Validation must match the claim. Start with the tests nearest the changed code,
configuration, script, or workflow, then add the smallest higher-level gate
that crosses the changed boundary.

## Local evidence

- `mise run tasks:docs:check` checks the generated task reference.
- `mise run tasks:validate` checks task metadata and task-runner contracts.
- `mise run check:contracts` covers repository tasks, maintained docs, Python
  locks, versioning, and release policy.
- `mise run check` is the complete current-host local gate.

Retained `.trellis/` tasks and specs are optional AI assistance. The local
gate neither requires nor validates a project-specific Trellis wrapper,
overlay, task, PRD, or spec before it can pass.

Targeted unit and Rust tests are useful while iterating, but a passing narrow
fixture is not evidence for an unrelated layer.

## Native and remote evidence

Local structure or policy tests cannot prove:

- a Windows x64 or ARM64 setup executable was built and packaged successfully
  on the matching architecture;
- an install/uninstall lifecycle result, when an operator elects to run that
  manual Windows diagnostic;
- an Authenticode state or certificate/timestamp policy;
- a macOS bundle's native identity and packaging;
- another architecture's Linux packages;
- a GitHub required check, attestation, or published Release.

Those claims require the matching native CI/release job and exact remote
source identity, except that an optional manual lifecycle claim requires the
recorded result from the matching Windows machine where it was run. The Release
workflow does not execute that lifecycle diagnostic. A public release claim
additionally requires the release workflow's re-download/digest checks,
metadata, attestation, public state, and Latest verification.

## Semantic scans

Historical cleanup scans need interpretation:

- retain real wire/schema/API/toolchain versions;
- retain negative tests that forbid retired assets or behavior;
- leave historical release notes and archived task evidence unchanged;
- reject operational references to removed versioned development packages or
  any external planning directory.
