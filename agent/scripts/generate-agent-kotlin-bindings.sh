#!/bin/bash
set -eux
INDEXER_DIR=${SCIP_TYPESCRIPT_DIR:-../scip-typescript-cody-bindings}

if [ ! -d $INDEXER_DIR ]; then
  git clone https://github.com/sourcegraph/scip-typescript.git $INDEXER_DIR
fi

pushd $INDEXER_DIR
git checkout olafurpg/signatures
yarn install
popd

pnpm build
# TODO: invoke @sourcegraph/scip-typescript npm package instead
pnpm dlx ts-node $INDEXER_DIR/src/main.ts index --emit-signatures --emit-external-symbols
pnpm dlx ts-node agent/src/cli/scip-codegen/command.ts --output agent/bindings/kotlin/lib/src/main/kotlin/com/sourcegraph/cody/protocol_generated
