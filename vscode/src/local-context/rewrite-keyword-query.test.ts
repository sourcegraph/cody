import type { Polly } from '@pollyjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPollyRecording } from '../testutils/polly'

import { rewriteKeywordQuery } from './rewrite-keyword-query'

import { type PromptString, mockResolvedConfig, ps } from '@sourcegraph/cody-shared'
import { SourcegraphNodeCompletionsClient } from '../completions/nodeClient'
import { TESTING_CREDENTIALS } from '../testutils/testing-credentials'

describe('rewrite-query', () => {
    const client = new SourcegraphNodeCompletionsClient()

    let polly: Polly
    beforeAll(() => {
        polly = startPollyRecording({
            recordingName: 'rewrite-query',
            // Run the command below to update recordings:
            // source agent/scripts/export-cody-http-recording-tokens.sh
            // CODY_RECORDING_MODE=record pnpm -C vscode test:unit
        })

        mockResolvedConfig({
            configuration: { customHeaders: {} },
            auth: {
                accessToken:
                    TESTING_CREDENTIALS.dotcom.token ?? TESTING_CREDENTIALS.dotcom.redactedToken,
                serverEndpoint: TESTING_CREDENTIALS.dotcom.serverEndpoint,
            },
        })
    })

    function check(query: PromptString, expectedHandler: (expandedTerm: string) => void): void {
        it(query.toString(), async () => {
            expectedHandler(await rewriteKeywordQuery(client, query))
        })
    }

    check(ps`Where is authentication router defined?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"Where is authentication router defined?"`)
    )

    check(ps`scan tokens in C++`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"scan tokens in C++"`)
    )

    check(ps`parse file with tree-sitter`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"parse file with tree-sitter"`)
    )

    check(ps`type Zoekt struct {`, expanded => expect(expanded).toMatchInlineSnapshot(`"struct zoekt"`))

    check(
        ps`type Zoekt struct {
\tClient zoekt.Searcher

\t// DisableCache when true prevents caching of Client.List. Useful in
\t// tests.
\tDisableCache bool

\tmu       sync.RWMute
`,
        expanded => expect(expanded).toMatchInlineSnapshot(`"cache sync test zoekt"`)
    )

    check(ps`C'est ou la logique pour recloner les dépôts?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"clone logic repository"`)
    )

    check(ps`Wie kann ich eine neue Datenbankmigration definieren?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"database define migration"`)
    )

    check(
        ps`Explain how the context window limit is calculated. how much budget is given to @-mentions vs. search context?`,
        expanded => expect(expanded).toMatchInlineSnapshot(`"budget context mentions search window"`)
    )

    check(
        ps`parse file with tree-sitter. follow these rules:\n*use the Google Go style guide\n*panic if parsing fails`,
        expanded =>
            expect(expanded).toMatchInlineSnapshot(`"go google guide panic parse style tree-sitter"`)
    )

    afterAll(async () => {
        await polly.stop()
    })
})
