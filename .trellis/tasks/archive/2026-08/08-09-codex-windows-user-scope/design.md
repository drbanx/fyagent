# Design

The Windows runtime identity service creates `InteractiveUserContext` once.
The context contains canonical SID plus process and Shell session identities;
Shell PID is a proof input rather than a persistent identity, so a legitimate
Explorer restart can be re-proved without changing the frozen user/session
context. The ordinary Windows adapter owns that context for its entire process
lifetime. Native inventory uses the locked Rust binding
`FindPackagesByUserSecurityIdWithPackageTypes(&sid, PackageTypes::Main)` for
the documented explicit-user/package-types API and returns context-bound
inventory evidence; deployment and launch return equivalent receipts. Every
boundary compares the receipt with the original context, and re-proves the
current process/Shell identity before a side effect.

The trusted selector admits only zero or one same-user Stable Main record.
Two or more matching records are ambiguous for discovery and restart; records
from another SID are outside the inventory. Discovery returns the
platform-neutral `MULTIPLE_INSTALLATIONS` error with non-retryable
`resolve_path_conflict` recovery. Restart returns the public
`ambiguous/installations` state and never issues a close/launch capability.
Windows runtime inspection also checks the package process token SID before it
can become close/liveness evidence, preventing another user's process with the
same PFN from entering a restart plan.

The all-users facade remains a separate explicit capability and retains its
all-user staged-package query. Tests inject identity and package adapters so
multi-SID behavior is hermetic and prove ordinary flows make zero all-users
calls. A narrow native smoke obtains only the current test process SID, calls
the real explicit-SID/Main WinRT boundary, permits an empty result, and
validates error propagation on matching x64 and ARM64 Windows runners.
