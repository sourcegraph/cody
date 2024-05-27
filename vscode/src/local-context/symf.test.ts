import type { Polly } from '@pollyjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPollyRecording } from '../testutils/polly'

import { _getSymfPath } from './download-symf'
import { symfExpandQuery } from './symfExpandQuery'

import { mkdtemp, open, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type PromptString, ps } from '@sourcegraph/cody-shared'
import { SourcegraphNodeCompletionsClient } from '../completions/nodeClient'
import { TESTING_CREDENTIALS } from '../testutils/testing-credentials'

describe('symf', () => {
    const client = new SourcegraphNodeCompletionsClient({
        accessToken: TESTING_CREDENTIALS.dotcom.token ?? TESTING_CREDENTIALS.dotcom.redactedToken,
        serverEndpoint: TESTING_CREDENTIALS.dotcom.serverEndpoint,
        customHeaders: {},
    })

    describe('expand-query', () => {
        let polly: Polly
        beforeAll(() => {
            polly = startPollyRecording({
                recordingName: 'symf',
                // Run the command below to update symf recordings:
                // source agent/scripts/export-cody-http-recording-tokens.sh
                // CODY_RECORDING_MODE=record pnpm -C vscode test:unit
            })
        })

        function check(query: PromptString, expectedHandler: (expandedTerm: string) => void): void {
            it(query.toString(), async () => {
                expectedHandler(await symfExpandQuery(client, query))
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
        afterAll(async () => {
            await polly.stop()
        })
    })

    describe('download', () => {
        it('no parallel download', async () => {
            const dir = await mkdtemp(path.join(tmpdir(), 'symf-'))
            try {
                const makeEmptyFile = async (filePath: string) => {
                    const file = await open(filePath, 'w')
                    await file.close()
                }

                let mockDownloadSymfCalled = 0
                const mockDownloadSymf = async (op: {
                    symfPath: string
                    symfFilename: string
                    symfURL: string
                }): Promise<void> => {
                    mockDownloadSymfCalled++
                    await makeEmptyFile(op.symfPath)
                }
                const symfPaths = await Promise.all(
                    [...Array(10).keys()].map(() => _getSymfPath(dir, mockDownloadSymf))
                )
                expect(symfPaths.every(p => p === symfPaths[0])).toBeTruthy()
                expect(mockDownloadSymfCalled).toEqual(1)
            } finally {
                await rmdir(dir, { recursive: true })
            }
        })
    })
})
