import NodeHttpAdapter from '@pollyjs/adapter-node-http'
import { MODE, Polly } from '@pollyjs/core'
import FSPersister from '@pollyjs/persister-fs'
import * as commander from 'commander'
import { Command, Option } from 'commander'

// Register the node http adapter so its accessible by all future polly instances

import { Agent } from '../agent'

// Polly.js silently falls back to recording when we explicitly set the mode to
// `replay`.  To make it more inconvenient to use this built-in `record`
// behavior, we introduce a new mode `replay-or-record` that mimics this
// behavior and customize the behavior of `record` to crash if we try to persist
// new recordings.
type CODY_RECORDING_MODE = MODE | 'replay-or-record'

interface JsonrpcCommandOptions {
    recordingDirectory?: string
    recordingMode?: CODY_RECORDING_MODE
    recordingName?: string
}

function recordingModeOption(value: string): CODY_RECORDING_MODE {
    switch (value) {
        case 'record':
        case 'replay':
        case 'passthrough':
        case 'stopped':
        case 'replay-or-record':
            return value
        default:
            throw new commander.InvalidArgumentError(
                'Not a valid recording mode. Valid options are record, record-or-record, replay, passthrough, or stopped.'
            )
    }
}

let enabledRecordingMode: CODY_RECORDING_MODE | undefined

/**
 * The default file system persister with two customizations
 *
 * - Replaces Cody access tokens with the string "REDACTED" because we don't
 *   want to commit the access token into git.
 * - Throws an error if the recording mode is `replay` because we don't want
 *   silently fallback to recording when replaying.
 */
class CodyPersister extends FSPersister {
    constructor(polly: any) {
        super(polly)
    }
    static get id() {
        return 'cody-fs'
    }
    public onSaveRecording(recordingId: string, recording: any) {
        if (enabledRecordingMode === 'replay') {
            // See docstring to CODY_RECORDING_MODE for explanation why we throw an error here.
            throw new Error(
                'Cannot save HTTP recording because CODY_RECORDING_MODE=replay. ' +
                    'To fix this problem, set the environment variable CODY_RECORDING_MODE=replay-or-record or CODY_RECORDING_MODE=record.'
            )
        }
        const entries: any[] = recording?.log?.entries ?? []
        for (const entry of entries) {
            const headers: { name: string; value: string }[] = entry?.request?.headers
            for (const header of headers) {
                if (header.name === 'authorization') {
                    header.value = 'token REDACTED'
                }
            }
        }
        return super.onSaveRecording(recordingId, recording)
    }
}

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
    .action((options: JsonrpcCommandOptions) => {
        let polly: Polly | undefined
        if (options.recordingDirectory) {
            if (options.recordingMode === undefined) {
                console.error('CODY_RECORDING_MODE is required when CODY_RECORDING_DIRECTORY is set.')
                process.exit(1)
            }
            enabledRecordingMode = options.recordingMode
            Polly.register(NodeHttpAdapter)
            Polly.register(CodyPersister)
            enabledRecordingMode = options.recordingMode
            const mode = options.recordingMode === 'replay-or-record' ? 'replay' : options.recordingMode
            polly = new Polly(options.recordingName ?? 'CodyAgent', {
                mode,
                adapters: ['node-http'],
                persister: 'cody-fs',
                recordFailedRequests: true,
                persisterOptions: {
                    fs: {
                        recordingsDir: options.recordingDirectory,
                    },
                },
            })
        } else if (options.recordingMode) {
            console.error('CODY_RECORDING_DIRECTORY is required when CODY_RECORDING_MODE is set.')
            process.exit(1)
        }

        process.stderr.write('Starting Cody Agent...\n')

        const agent = new Agent({ polly })

        console.log = console.error

        // Force the agent process to exit when stdin/stdout close as an attempt to
        // prevent zombie agent processes. We experienced this problem when we
        // forcefully exit the IntelliJ process during local `./gradlew :runIde`
        // workflows. We manually confirmed that this logic makes the agent exit even
        // when we forcefully quit IntelliJ
        // https://github.com/sourcegraph/cody/pull/1439#discussion_r1365610354
        process.stdout.on('close', () => process.exit(1))
        process.stdin.on('close', () => process.exit(1))

        process.stdin.pipe(agent.messageDecoder)
        agent.messageEncoder.pipe(process.stdout)
    })
