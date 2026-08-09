# Design

The task-local inventory is the migration ledger, not a new product history.
For each source section it records disposition, destination owner, and evidence.
Current mutable rules have exactly one owner: executable behavior in code/tests,
durable contract in active spec, and optional developer explanation under
`docs/fyagent/development/`. Historical narrative is deleted from the current
tree and remains recoverable through Git and existing Trellis archives.

Reference checks distinguish product-version narrative from real protocol,
schema, third-party API, and toolchain versions. Default AI context routes only
through active task/spec/current docs; archive/history is consulted explicitly.
