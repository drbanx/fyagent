# Design

`scripts/trellis/overlay-manifest.json` uses schema
`fyagent-trellis-overlay/v1`. A declared overlay records the managed path,
owner/reason, upstream base SHA-256, transform/patch input, and expected output
SHA-256. Reconcile accepts only exact base or exact output. Verify compares the
installed managed-template manifest, the worktree, and declared overlays and
fails on any third state.

Project-owned JSON customization is applied structurally; reviewed Python hook
customizations use deterministic checked-in patches. General project rules
live in the FyAgent entry skill/spec so bundled Trellis files can remain
upstream. Fixture repositories exercise both commands without modifying the
real task archive or invoking `trellis update`.
