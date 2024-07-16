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
    const credentials = TESTING_CREDENTIALS.dotcom
    let polly: Polly
    const agentDirectory = getAgentDir()
    const tmp = new TestWorkspace(path.join(agentDirectory, 'src', '__tests__', 'cody-cli-chat'))
    async function runCommand(params: {
        args: string[]
        expectedExitCode?: number
    }): Promise<ChatCommandResult> {
        // For some reason, I can't get the option parsing working with
        // `--access-token` or `--endpoint` so we modify process.env instead.
        process.env.SRC_ACCESS_TOKEN = credentials.token ?? credentials.redactedToken
        process.env.SRC_ENDPOINT = credentials.serverEndpoint
        process.env.DISABLE_FEATURE_FLAGS = 'true'
        process.env.CODY_TELEMETRY_EXPORTER = 'testing'
        const args = [...params.args, '--dir', tmp.rootPath, '--silent']

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
        options.debug = true
        const exitCode = await chatAction(options)
        if (exitCode !== (params.expectedExitCode ?? 0)) {
            throw new Error(
                YAML.stringify({
                    exitCode,
                    expectedExitCode: params.expectedExitCode,
                    stdout: stdout.buffer,
                    stderr: stderr.buffer,
                })
            )
        }
        return {
            command: 'cody chat ' + params.args.join(' '),
            exitCode,
            stdout: stdout.buffer,
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

    it('--message (hello world test)', async () => {
        expect(
            YAML.stringify(
                await runCommand({
                    args: ['chat', '-m', 'respond with "hello" and nothing else'],
                })
            )
        ).toMatchSnapshot()
    }, 10_000)

    // Only works for Sourcegraph Enterprise users. Blocked by CODY-2884.
    it.skip('--context-repo (squirrel test)', async () => {
        expect(
            YAML.stringify(
                await runCommand({
                    args: [
                        'chat',
                        '--context-repo',
                        'github.com/sourcegraph/sourcegraph',
                        '-m',
                        'what is squirrel? Explain as briefly as possible.',
                    ],
                })
            )
        ).toMatchSnapshot()
    }, 20_000)

    it('--context-file (animal test)', async () => {
        expect(
            YAML.stringify(
                await runCommand({
                    args: [
                        'chat',
                        '--context-file',
                        'animal.ts',
                        '-m',
                        'implement a cow. Only print the code without any explanation.',
                    ],
                })
            )
        ).toMatchSnapshot()
    }, 20_000)
})
