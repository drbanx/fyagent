# Implementation

1. Trace the current identity-to-discovery-to-restart data flow and freeze
   all-users ownership.
2. Add the interactive context and make Shell proof authoritative.
3. Thread context through ordinary inventory, installation/update,
   post-verification, and restart/launch.
4. Change only the ordinary WinRT query to explicit SID plus Main.
5. Extend fakes for SID/package-types/capability calls and add multi-SID,
   ambiguity, mismatch, and lifecycle drift tests.
6. Add native WinRT smoke and run targeted Rust fmt/check/clippy/tests.
