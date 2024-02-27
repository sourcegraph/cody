import { createServer } from 'net'
import type { EXPIRY_STRATEGY, MODE, Polly, Request } from '@pollyjs/core'
import * as commander from 'commander'
import { Command, Option } from 'commander'

import { startPollyRecording } from '../../../vscode/src/testutils/polly'
import { Agent } from '../agent'

import { booleanOption } from './evaluate-autocomplete/cli-parsers'

interface JsonrpcCommandOptions {
    expiresIn?: string | null | undefined
    recordingDirectory?: string
    keepUnusedRecordings?: boolean
    recordingMode?: MODE
    recordIfMissing?: boolean
    recordingExpiryStrategy?: EXPIRY_STRATEGY
    recordingName?: string
}

export interface PollyRequestError {
    request: Request
    error: string
}

function recordingModeOption(value: string): MODE {
    switch (value) {
        case 'record':
        case 'replay':
        case 'passthrough':
        case 'stopped':
            return value
        default:
            throw new commander.InvalidArgumentError(
                'Not a valid recording mode. Valid options are record, replay-or-record, replay, passthrough, or stopped.'
            )
    }
}

function expiryStrategyOption(value: string): EXPIRY_STRATEGY {
    switch (value) {
        case 'error':
        case 'warn':
        case 'record':
            return value
        default:
            throw new commander.InvalidArgumentError(
                'Not a valid expiry strategy. Valid options are error, warn, or record.'
            )
    }
}

const isDebugMode = process.env.CODY_AGENT_DEBUG_REMOTE === 'true'
const debugPort = process.env.CODY_AGENT_DEBUG_PORT
    ? parseInt(process.env.CODY_AGENT_DEBUG_PORT, 10)
    : 3113

export const jsonrpcCommand = new Command('jsonrpc')
    .description(
        'Interact with the Agent using JSON-RPC via stdout/stdin. ' +
            'This is the subcommand that is used by Cody clients like the JetBrains and Neovim plugins.'
    )
    .addOption(
        new Option(
            '--recording-directory <path>',
            'Path to the directory where network traffic is recorded or replayed from. This option should only be used in testing environments.'
        ).env('CODY_RECORDING_DIRECTORY')
    )
    .addOption(
        new Option(
            '--keep-unused-recordings <bool>',
            'If true, unused recordings are not removed from the recording file'
        )
            .env('CODY_KEEP_UNUSED_RECORDINGS')
            .argParser(booleanOption)
            .default(false)
    )
    .addOption(
        new Option(
            '--recording-mode <mode>',
            'What kind of recording mode to use. Valid values are to the directory where network traffic is recorded or replayed from. This option should only be used in testing environments.'
        )
            .argParser(recordingModeOption)
            .env('CODY_RECORDING_MODE')
    )
    .addOption(
        new Option(
            '--recording-name <mode>',
            'The name of the recording to use. Every unique name results in a unique recording (HAR file). Use a unique name for every unique test in your test suite.'
        ).env('CODY_RECORDING_NAME')
    )
    .addOption(
        new Option(
            '--recording-expiry-strategy <strategy>',
            'What to do when encountering an expired recording). Use a unique name for every unique test in your test suite.'
        )
            .argParser(expiryStrategyOption)
            .env('CODY_RECORDING_EXPIRY_STRATEGY')
            .default('error')
    )
    .addOption(
        new Option('--recording-expires-in <duration>', 'When to expire the recordings')
            .env('CODY_RECORDING_EXPIRES_IN')
            .default('365d')
    )
    .addOption(
        new Option('--record-if-missing <true|false>', 'If false, fails the test instead of recording')
            .env('CODY_RECORD_IF_MISSING')
            .argParser(booleanOption)
            .default(false)
    )
    .action((options: JsonrpcCommandOptions) => {
        const networkRequests: Request[] = []
        const requestErrors: PollyRequestError[] = []
        let polly: Polly | undefined
        if (options.recordingDirectory) {
            if (options.recordingMode === undefined) {
                console.error('CODY_RECORDING_MODE is required when CODY_RECORDING_DIRECTORY is set.')
                process.exit(1)
            }
            polly = startPollyRecording({
                recordingName: options.recordingName ?? 'CodyAgent',
                recordingDirectory: options.recordingDirectory,
                keepUnusedRecordings: options.keepUnusedRecordings,
                recordingMode: options.recordingMode,
                expiresIn: options.expiresIn,
                recordIfMissing: options.recordIfMissing,
                recordingExpiryStrategy: options.recordingExpiryStrategy,
            })
            polly.server.any().on('request', req => {
                networkRequests.push(req)
            })
            polly.server.any().on('error', (request, error) => {
                requestErrors.push({ request, error: `${error}` })
            })
            // Automatically pass through requests to GitHub because we
            // don't want to record huge binary downloads.
            polly.server.get('https://github.com/*path').passthrough()
            // Uncomment below if you want to intercept network requests to, for
            // example, fail github.com downloads. This can be helpful to reproduce
            // situations where users are running Cody on airgapped computers.
            // polly.server.get('https://github.com/*path').intercept((_req, res) => {
            //     res.sendStatus(400)
            // })
            polly.server.get('https://objects.githubusercontent.com/*path').passthrough()
        } else if (options.recordingMode) {
            console.error('CODY_RECORDING_DIRECTORY is required when CODY_RECORDING_MODE is set.')
            process.exit(1)
        }

        if (isDebugMode) {
            const server = createServer(socket => {
                setupAgentCommunication({
                    polly,
                    networkRequests,
                    requestErrors,
                    stdin: socket,
                    stdout: socket,
                })
            })

            server.listen(debugPort, () => {
                console.log(`Agent debug server listening on port ${debugPort}`)
            })
        } else {
            setupAgentCommunication({
                polly,
                networkRequests,
                requestErrors,
                stdin: process.stdin,
                stdout: process.stdout,
            })
        }
    })

function setupAgentCommunication(params: {
    polly: Polly | undefined
    networkRequests: Request[]
    requestErrors: PollyRequestError[]
    stdin: NodeJS.ReadableStream
    stdout: NodeJS.WritableStream
}) {
    const agent = new Agent(params)

    // Force the agent process to exit when stdin/stdout close as an attempt to
    // prevent zombie agent processes. We experienced this problem when we
    // forcefully exit the IntelliJ process during local `./gradlew :runIde`
    // workflows. We manually confirmed that this logic makes the agent exit even
    // when we forcefully quit IntelliJ
    // https://github.com/sourcegraph/cody/pull/1439#discussion_r1365610354
    if (!isDebugMode) {
        params.stdout.on('close', () => process.exit(1))
        params.stdin.on('close', () => process.exit(1))
    }

    params.stdin.pipe(agent.messageDecoder)
    agent.messageEncoder.pipe(params.stdout)
}
