#!/bin/bash
set -eu
if ! git diff --exit-code; then
  echo '=============================
Failing this CI check because the changes in this PR influence the Cody Agent protocol.
The most common reason for this problem is that the commit adds a new property to an existing
type that is transitively referenced by the Cody Agent protocol (vscode/src/jsonrpc/agent-protocol.ts).

To fix this problem, re-generate the Kotlin bindings to confirm that the new changes
can be easily represented in non-TypeScript clients:

  pnpm generate-agent-kotlin-bindings
  git add agent/bindings/kotlin
  git commit -am "Re-generate Kotlin bindings"
  git push YOUR_BRANCH
'
  exit 1
fi
