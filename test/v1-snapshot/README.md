# v1 snapshot (test fixture, not shipped)

A read-only copy of `dash4devs@0.1.23-alpha` (`Dash4Devs/dash4devs-sdk`, commit in
`SOURCE_COMMIT`): runtime JS and `.d.ts` files only, no CLI. The compatibility
tests run the same calls through this copy and through v2 and compare the
requests and results, and the type test asserts v2's declarations are
assignable to these. Refresh it only by copying from the v1 repo; never edit it.
