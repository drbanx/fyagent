# Design

The Windows runtime identity service creates `InteractiveUserContext` once.
The context contains canonical SID plus process and Shell session identities
and is passed into the ordinary Windows package-manager facade. Native
inventory uses `FindPackagesForUserWithPackageTypes(sid, Main)`; candidate
filtering and ambiguity remain in the trusted domain layer.

The all-users facade remains a separate explicit capability. Tests inject
identity and package adapters so multi-SID behavior is hermetic; a narrow
native smoke calls only the real explicit-SID WinRT boundary and validates
error mapping on matching native Windows runners.
