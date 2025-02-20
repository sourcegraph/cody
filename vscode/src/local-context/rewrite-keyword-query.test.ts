import type { Polly } from '@pollyjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPollyRecording } from '../testutils/polly'

import { rewriteKeywordQuery } from './rewrite-keyword-query'

import {
    CLIENT_CAPABILITIES_FIXTURE,
    type PromptString,
    mockClientCapabilities,
    mockResolvedConfig,
    ps,
} from '@sourcegraph/cody-shared'
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
                credentials: {
                    token: TESTING_CREDENTIALS.dotcom.token ?? TESTING_CREDENTIALS.dotcom.redactedToken,
                },
                serverEndpoint: TESTING_CREDENTIALS.dotcom.serverEndpoint,
            },
        })
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
    })

    function check(query: PromptString, expectedHandler: (expandedTerm: string) => void): void {
        it(query.toString(), async () => {
            expectedHandler(await rewriteKeywordQuery(client, query))
        })
    }

    check(ps`Where is authentication router defined?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"authentication router"`)
    )

    check(ps`scan tokens in C++`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"token scanner C++"`)
    )

    check(ps`parse file with tree-sitter`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"tree-sitter parse"`)
    )

    check(ps`type Zoekt struct {`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"type Zoekt struct"`)
    )

    check(
        ps`type Zoekt struct {
\tClient zoekt.Searcher

\t// DisableCache when true prevents caching of Client.List. Useful in
\t// tests.
\tDisableCache bool

\tmu       sync.RWMute
`,
        expanded => expect(expanded).toMatchInlineSnapshot(`"type Zoekt struct"`)
    )

    check(ps`C'est ou la logique pour recloner les dépôts?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"clone repository logic"`)
    )

    check(ps`Wie kann ich eine neue Datenbankmigration definieren?`, expanded =>
        expect(expanded).toMatchInlineSnapshot(`"database migration create"`)
    )

    check(
        ps`Explain how the context window limit is calculated. how much budget is given to @-mentions vs. search context?`,
        expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"context window limit calculation budget @-mentions search"`
            )
    )

    check(
        ps`parse file with tree-sitter. follow these rules:\n*use the Google Go style guide\n*panic if parsing fails`,
        expanded => expect(expanded).toMatchInlineSnapshot(`"tree-sitter parse"`)
    )

    afterAll(async () => {
        await polly.stop()
    })
})
