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

describe('symf', () => {
    const client = new SourcegraphNodeCompletionsClient({
        accessToken:
            // The redacted ID below is copy-pasted from the recording file and needs to be updated
            // whenever we change the underlying access token. We can't return a random string here
            // because then Polly won't be able to associate the HTTP requests between record mode
            // and replay mode.
            process.env.SRC_ACCESS_TOKEN ??
            'REDACTED_b09f01644a4261b32aa2ee4aea4f279ba69a57cff389f9b119b5265e913c0ea4',
        serverEndpoint: process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com',
        customHeaders: {},
    })

    describe('expand-query', () => {
        let polly: Polly
        beforeAll(() => {
            polly = startPollyRecording({
                recordingName: 'symf',
                // To update symf recordings, uncomment the following two lines,
                // recordingMode: 'record',
                // keepUnusedRecordings: false,
                // Then:
                // source agent/scripts/export-cody-http-recording-tokens.sh
                // pnpm -C vscode test:unit
            })
        })

        function check(query: PromptString, expectedHandler: (expandedTerm: string) => void): void {
            it(query.toString(), async () => {
                expectedHandler(await symfExpandQuery(client, query))
            })
        }

        check(ps`ocean`, expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"circulation current ebb flow ocean ppt psu salinity salt sea stream surf tidal tide water wave waves"`
            )
        )

        check(ps`How do I write a file to disk in Go`, expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"disk drive file files go golang storage write writefile writetofile"`
            )
        )

        check(ps`Where is authentication router defined?`, expanded =>
            expect(expanded).toMatchInlineSnapshot(
                '"auth authenticate authentication define defined definition route router routing"'
            )
        )

        check(ps`parse file with tree-sitter`, expanded =>
            expect(expanded).toMatchInlineSnapshot(
                `"file parse parser parsing read reading reads tree tree-sitter treesitter"`
            )
        )

        check(ps`scan tokens in C++`, expanded =>
            expect(expanded).toMatchInlineSnapshot(`"C++ c++ cpp scan scanner scanning token tokens"`)
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
