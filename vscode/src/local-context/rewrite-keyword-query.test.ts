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
            `"aquatic marine marine_data maritime ocean ocean_data oceanographer oceanographic oceanographic_data oceanography oceanologic oceanology science scientist sea"`
        )
    )

    check(ps`How do I write a file to disk in Go`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"disk file files go golang io persist save storage store write"`
        )
    )

    check(
        ps`type Zoekt struct {
\tClient zoekt.Searcher

\t// DisableCache when true prevents caching of Client.List. Useful in
\t// tests.
\tDisableCache bool

\tmu       sync.RWMute
`,
        expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"cache cached caching mutex search search_engine searcher sync synchronization test testing zoekt"`
            )
    )

    check(ps`Where is authentication router defined?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"auth auth-related authentication define defined definition definition-site login route-related router routing security"`
        )
    )

    check(ps`parse file with tree-sitter`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"file files parse parser parsing sitter tree tree-parser tree-sitter treesitter"`
        )
    )

    check(ps`scan tokens in C++`, expanded =>
        expect(expanded).toMatchInlineSnapshot(
            `"c++ cplusplus cpp cxx lexeme lexer lexical_element lexical_unit scanner token tokenizer"`
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
                `"algorithm clone git logic process reclone replication repo repository workflow"`
            ),
        { restrictRewrite: true }
    )

    check(
        ps`Explain how the context window limit is calculated. how much budget is given to @-mentions vs. search context?`,
        expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"@-mentions allocation budget context context-window context_window limit mentions resource search search-context window"`
            ),
        { restrictRewrite: true }
    )

    afterAll(async () => {
        await polly.stop()
    })
})
