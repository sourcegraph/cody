import path from 'node:path'
import { describe } from 'node:test'
import type { Polly } from '@pollyjs/core'
import { afterAll, beforeAll, expect, it } from 'vitest'
import YAML from 'yaml'
import { startPollyRecording } from '../../../vscode/src/testutils/polly'
import { TESTING_CREDENTIALS } from '../../../vscode/src/testutils/testing-credentials'
import { buildAgentBinary, getAgentDir } from '../TestClient'
import { TestWorkspace } from '../TestWorkspace'
import { Streams, StringBufferStream } from './Streams'
import { isWindows } from './command-bench/isWindows'
import { type ChatOptions, chatAction, chatCommand } from './command-chat'

process.env.CODY_SHIM_TESTING = 'true'
process.env.DISABLE_FEATURE_FLAGS = 'true'

interface ChatCommandResult {
    command: string
    exitCode: number
    stdout: string
    stderr: string
}

describe('cody chat', () => {
    const credentials = TESTING_CREDENTIALS.s2
    let polly: Polly
    const agentDirectory = getAgentDir()
    const tmp = new TestWorkspace(path.join(agentDirectory, 'src', '__tests__', 'cody-cli-chat'))
    async function runCommand(params: {
        args: string[]
        expectedExitCode?: number
    }): Promise<ChatCommandResult> {
        process.env.CODY_TELEMETRY_EXPORTER = 'testing'
        const args = [
            ...params.args,
            '--dir',
            tmp.rootPath,
            '--endpoint',
            credentials.serverEndpoint,
            '--access-token',
            credentials.token ?? credentials.redactedToken,
            '--silent',
        ]

        const command = chatCommand()
        const parseResult = command.parseOptions(args)
        if (parseResult.unknown.length > 0) {
            throw new Error(`Unknown options: ${parseResult.unknown.join(', ')}`)
        }
        const options = command.opts<ChatOptions>()
        options.isTesting = true

        const stdout = new StringBufferStream()
        const stderr = new StringBufferStream()
        options.streams = new Streams(stdout, stderr)
        // Uncomment below to see output channel logs from Cody
        // options.debug = true
        const exitCode = await chatAction(options)
        if (exitCode !== (params.expectedExitCode ?? 0)) {
            const extraHint =
                stdout.buffer.length === 0 && stderr.buffer.length === 0
                    ? 'Stdout and stderr are empty even if the process exited with a non-zero code. ' +
                      'Comment out the --silent option from the test file to try to get more debugging information.'
                    : undefined
            throw new Error(
                YAML.stringify({
                    exitCode,
                    expectedExitCode: params.expectedExitCode,
                    stdout: stdout.buffer,
                    stderr: stderr.buffer,
                    extraHint,
                })
            )
        }
        return {
            command: 'cody chat ' + params.args.join(' '),
            exitCode,
            stdout: stdout.buffer.replaceAll(tmp.rootPath, 'WORKING_DIRECTORY'),
            stderr: stderr.buffer,
        }
    }

    beforeAll(() => {
        tmp.beforeAll()
        buildAgentBinary()
        polly = startPollyRecording({
            recordingName: 'cody-chat',
            keepUnusedRecordings: process.env.CODY_KEEP_UNUSED_RECORDINGS === 'true',
            recordingDirectory: path.join(agentDirectory, 'recordings'),
        })
    })

    afterAll(async () => {
        tmp.afterAll()
        await polly.stop()
    })

    it('--message (hello world test)', { timeout: 10000, repeats: 2 }, async () => {
        expect(
            YAML.stringify(
                await runCommand({
                    args: ['chat', '-m', 'respond with "hello" and nothing else'],
                })
            )
        ).toMatchSnapshot()
    })

    // This test is failing on macOS. It reports remote search results as failing
    // the context filter, probably because it does not wait for the context filter fetch.
    // This test is failing consistently on windows. https://linear.app/sourcegraph/issue/CODY-2912/cli-squirrel-test-failing-on-windows
    it.skip('--context-repo (squirrel test)', async () => {
        expect(
            YAML.stringify(
                await runCommand({
                    args: [
                        'chat',
                        '--context-repo',
                        'github.com/sourcegraph/sourcegraph',
                        '--show-context',
                        '-m',
                        'what is squirrel? Explain as briefly as possible.',
                    ],
                })
            )
        ).toMatchSnapshot()
    }, 20_000)

    it.skipIf(isWindows())('--context-file (animal test)', { timeout: 20000, repeats: 2 }, async () => {
        expect(
            YAML.stringify(
                await runCommand({
                    args: [
                        'chat',
                        '--context-file',
                        'animal.ts',
                        '--show-context',
                        '-m',
                        'implement a cow. Only print the code without any explanation.',
                    ],
                })
            )
        ).toMatchSnapshot()
    })
})
