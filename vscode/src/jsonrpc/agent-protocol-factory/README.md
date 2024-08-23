Currently there are losts of different protocol constructors, conversion helpers, and manual interface allocations across `lib`, `agent`, `shim` and `vscode`. This has led to numerous bugs because a small protocol or implementation changes can have many side-effects that easily fly under the radar of the type-checker.

Ultimately I'd like to move the entire protocol to a [TypeSpec](1) and generate these Protocol helpers/factories automatically. Also making sure the auto-generated code has convenient extension points to inject custom behavior. [Somewhat similar](2) to what we already (plan to) do with SCIP and the [language bindings in JetBrains.](3)

This `agent-protocol-factory` dir is a temporary first-step to at least collect all of the manual methods in a single location so we have more visibility on the implementation details and "impact area" of such a protocol change.

[1]: https://typespec.io/
[2]: https://linear.app/sourcegraph/issue/CODY-2860/generate-empty-companion-object
[3]: https://sourcegraph.com/github.com/sourcegraph/jetbrains/-/blob/src/main/kotlin/com/sourcegraph/cody/agent/protocol_extensions/Range.kt
