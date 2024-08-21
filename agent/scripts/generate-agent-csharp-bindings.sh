#!/bin/bash
set -eux

INDEXER_DIR=${SCIP_TYPESCRIPT_DIR:-../scip-typescript-cody-bindings}
OUTPUT_DIR="agent/dist/bindings/csharp"
RUN_VALIDATION_STEP=false
PROTOCOL_NAMESPACE="Cody.Core.Agent.Protocol"

if [ ! -d "$INDEXER_DIR" ]; then
  git clone https://github.com/sourcegraph/scip-typescript.git "$INDEXER_DIR"
fi

pushd "$INDEXER_DIR"
git fetch origin
git checkout olafurpg/signatures-rebase1
git pull origin olafurpg/signatures-rebase1
pnpm install
popd

pnpm install --prefer-offline
pnpm build
# TODO: invoke @sourcegraph/scip-typescript npm package instead
pnpm exec ts-node "$INDEXER_DIR"/src/main.ts index --emit-signatures --emit-external-symbols
pnpm exec ts-node agent/src/cli/scip-codegen/command.ts --output "$OUTPUT_DIR" --language csharp --kotlin-package "$PROTOCOL_NAMESPACE"

if [ "$RUN_VALIDATION_STEP" = false ]; then
  # exit early if we don't want to run the validation step
  exit 0
fi

# Loop through files and check for specific words that should not be present in C# code.
BAD_WORD_LIST=("typealias" "package com.sourcegraph.cody.protocol_generated" " val " "data class" "gson.")
# TODO: remove this once we have a better way to generate the bindings
echo "Checking files for specific words..."
for file in "$OUTPUT_DIR"/*; do
    if [ -f "$file" ]; then
        for word in "${BAD_WORD_LIST[@]}"; do
            if grep -q "$word" "$file"; then
                echo "Error: Found '$word' in $file" >&2
                exit 1
            fi
        done
    fi
done
echo "File check complete. No specified words found."
