import type { Polly } from '@pollyjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPollyRecording } from '../testutils/polly'

import { rewriteKeywordQuery } from './rewrite-keyword-query'

import { type PromptString, ps } from '@sourcegraph/cody-shared'
import { SourcegraphNodeCompletionsClient } from '../completions/nodeClient'
import { TESTING_CREDENTIALS } from '../testutils/testing-credentials'

describe('rewrite-query', () => {
    const client = new SourcegraphNodeCompletionsClient({
        accessToken: TESTING_CREDENTIALS.dotcom.token ?? TESTING_CREDENTIALS.dotcom.redactedToken,
        serverEndpoint: TESTING_CREDENTIALS.dotcom.serverEndpoint,
        customHeaders: {},
    })

    let polly: Polly
    beforeAll(() => {
        polly = startPollyRecording({
            recordingName: 'rewrite-query',
            // Run the command below to update recordings:
            // source agent/scripts/export-cody-http-recording-tokens.sh
            // CODY_RECORDING_MODE=record pnpm -C vscode test:unit
        })
    })

    function check(
        query: PromptString,
        expectedHandler: (expandedTerm: string) => void,
        options?: {
            restrictRewrite: boolean
        }
    ): void {
        it(query.toString(), async () => {
            expectedHandler(await rewriteKeywordQuery(client, query, options))
        })
    }

    check(ps`ocean`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"aquatic fish marine maritime nautical ocean sea sealife surf swell tide underwater water wave"`
        )
    )

    check(ps`How do I write a file to disk in Go`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"disk file files go golang io persist save storage store write"`
        )
    )

    check(ps`Where is authentication router defined?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"auth authentication authorization config configuration route router routing"`
        )
    )

    check(ps`parse file with tree-sitter`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"file files parse parser parsing sitter tree tree-sitter treesitter"`
        )
    )

    check(ps`scan tokens in C++`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"analyze c++ cplusplus cpp cxx lex lexer lexical parse scan scanner token tokenizer"`
        )
    )

    // Test that when the 'restricted' parameter is enabled,  we only rewrite non-ASCII and multi-sentence queries
    check(
        ps`scan tokens in C++! `,
        expanded => expect(expanded).toMatchInlineSnapshot(`"scan tokens in C++! "`),
        { restrictRewrite: true }
    )

    check(
        ps`C'est ou la logique pour recloner les dépôts?`,
        expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"algorithm clone cloning config configuration git logic reasoning repo repository settings vcs version-control"`
            ),
        { restrictRewrite: true }
    )

    check(
        ps`Explain how the context window limit is calculated. how much budget is given to @-mentions vs. search context?`,
        expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"@-mentions allocation budget budget-allocation budget_allocation context context window context-window context_window limit mentions search context search-context search_context window"`
            ),
        { restrictRewrite: true }
    )

    afterAll(async () => {
        await polly.stop()
    })
})
