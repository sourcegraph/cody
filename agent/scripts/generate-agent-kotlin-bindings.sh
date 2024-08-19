#!/bin/bash
set -eux
INDEXER_DIR=${SCIP_TYPESCRIPT_DIR:-../scip-typescript-cody-bindings}

if [ ! -d $INDEXER_DIR ]; then
  git clone https://github.com/sourcegraph/scip-typescript.git $INDEXER_DIR
fi

pushd $INDEXER_DIR
git fetch origin
git checkout olafurpg/signatures-rebase1
git pull origin olafurpg/signatures-rebase1
yarn install
popd

pnpm install --prefer-offline
pnpm build
# TODO: invoke @sourcegraph/scip-typescript npm package instead
pnpm exec ts-node $INDEXER_DIR/src/main.ts index --emit-signatures --emit-external-symbols
pnpm exec ts-node agent/src/cli/scip-codegen/command.ts --output agent/bindings/kotlin/lib/src/main/kotlin/com/sourcegraph/cody/agent/protocol_generated
