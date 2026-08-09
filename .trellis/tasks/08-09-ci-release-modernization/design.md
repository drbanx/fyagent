# Design

`scripts/ci/classify-changes.mjs --base <sha> --head <sha> --json` owns path
classification. Workflow YAML consumes its stable booleans instead of
duplicating globs. The required evaluator receives job conclusions plus the
requested-domain set and is tested independently.

The dev-release eligibility engine is pure logic over normalized GitHub/Git
metadata. The workflow fetches metadata with read-only permissions, validates
repository/workflow/event/branch/head SHA and the stable required result, then
hands only an eligible source to build/publish jobs. Publication stays a draft
transaction until remote byte re-download, metadata, signing-state, and
attestation gates succeed.
