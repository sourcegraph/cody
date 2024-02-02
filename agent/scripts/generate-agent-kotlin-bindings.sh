#!/bin/bash
set -eux
git submodule update --init --recursive
pushd agent/bindings/scip-typescript
yarn install
popd
pnpm build
# TODO: invoke @sourcegraph/scip-typescript npm package instead
pnpm dlx ts-node agent/bindings/scip-typescript/src/main.ts index --emit-signatures --emit-external-symbols
pnpm dlx ts-node agent/src/cli/scip-codegen/command.ts --output agent/bindings/kotlin/lib/src/main/kotlin/com/sourcegraph/cody/protocol_generated
