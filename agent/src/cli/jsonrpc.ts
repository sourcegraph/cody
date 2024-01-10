import NodeHttpAdapter from '@pollyjs/adapter-node-http'
import { Polly, type EXPIRY_STRATEGY, type MODE, type Request } from '@pollyjs/core'
import { type Har } from '@pollyjs/persister'
import FSPersister from '@pollyjs/persister-fs'
import * as commander from 'commander'
import { Command, Option } from 'commander'

import { Agent } from '../agent'

import { decodeCompressedBase64 } from './base64'
import { booleanOption } from './evaluate-autocomplete/cli-parsers'
import { PollyYamlWriter } from './pollyapi'

interface JsonrpcCommandOptions {
    expiresIn?: string | null | undefined
    recordingDirectory?: string
    recordingMode?: MODE
    recordIfMissing?: boolean
    recordingExpiryStrategy?: EXPIRY_STRATEGY
    recordingName?: string
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

class CodyNodeHttpAdapter extends NodeHttpAdapter {
    public async onRequest(request: Request): Promise<void> {
        if (request.body) {
            request.body = request.body
                .replaceAll(/`([^`]*)(cody-vscode-shim-test[^`]*)`/g, '`$2`')
                .replaceAll(/(\\\\)(\w)/g, '/$2')
        }

        return super.onRequest(request)
    }
}

/**
 * The default file system persister with the following customizations
 *
 * - Replaces Cody access tokens with the string "REDACTED" because we don't
 *   want to commit the access token into git.
 * - To avoid diff churn/conflicts:
 *   - Sets date headers to a known static date
 *   - Removes cookies
 *   - Sets dates/timing information stored by Polly to static values
 */
class CodyPersister extends FSPersister {
    // HACK: `FSPersister` has a private `api` property that writes the
    // recording.har file using JSON format. We override the `api` property here
    // with a custom implementation that uses YAML format instead. This property
    // is intentionally marked as public even if it's not used anywhere.
    public api: PollyYamlWriter

    constructor(polly: any) {
        super(polly)
        if (!this.options.recordingsDir) {
            throw new Error('No recording directory provided')
        }
        this.api = new PollyYamlWriter(this.options.recordingsDir)
    }
    public static get id(): string {
        return 'cody-fs'
    }

    public async onFindRecording(recordingId: string): Promise<Har | null> {
        const har = await super.onFindRecording(recordingId)
        if (har === null) {
            return har
        }
        for (const entry of har.log.entries) {
            const postData = entry?.request?.postData
            if (postData !== undefined && postData?.text === undefined && (postData as any)?.textJSON !== undefined) {
                // Format `postData.textJSON` back into the escaped string for the `.text` format.
                postData.text = JSON.stringify((postData as any).textJSON)
                ;(postData as any).textJSON = undefined
            }
        }
        return har
    }

    public onSaveRecording(recordingId: string, recording: Har): Promise<void> {
        const entries = recording.log.entries
        recording.log.entries.sort((a, b) => a.request.url.localeCompare(b.request.url))
        for (const entry of entries) {
            if (entry.request?.postData?.text?.startsWith('{')) {
                // Format `postData.text` as a JSON object instead of escaped string.
                // This makes it much easier to review the har file locally.
                const postData: any = entry.request.postData
                postData.textJSON = JSON.parse(entry.request.postData.text)
                postData.text = undefined
            }
            // Clean up the entries to reduce the size of the diff when re-recording
            // and to remove any access tokens.

            // Update any headers
            entry.request.bodySize = undefined
            entry.request.headersSize = 0
            entry.response.bodySize = undefined
            entry.response.headersSize = 0
            const headers = [...entry.request.headers, ...entry.response.headers]
            for (const header of headers) {
                switch (header.name) {
                    case 'authorization':
                        header.value = 'token REDACTED'
                        break
                    case 'date':
                        header.value = 'Fri, 05 Jan 2024 11:11:11 GMT'
                        break
                    case 'retry-after':
                        header.value = '0'
                        break
                }
            }

            // Remove any headers and cookies we don't need at all.
            entry.request.headers = this.filterHeaders(entry.request.headers)
            entry.response.headers = this.filterHeaders(entry.response.headers)
            entry.request.cookies.length = 0
            entry.response.cookies.length = 0

            // And other misc fields.
            entry.startedDateTime = 'Fri, 05 Jan 2024 00:00:00 GMT'
            entry.time = 0
            entry.timings = {
                blocked: -1,
                connect: -1,
                dns: -1,
                receive: 0,
                send: 0,
                ssl: -1,
                wait: 0,
            }
            const responseContent = entry.response.content
            if (
                responseContent?.encoding === 'base64' &&
                responseContent?.mimeType === 'application/json' &&
                responseContent.text
            ) {
                // The GraphQL responses are base64+gzip encoded. We decode them
                // in a sibling `textDecoded` property so we can more easily review
                // in in pull requests.
                try {
                    const text = JSON.parse(responseContent.text)[0]
                    const decodedBase64 = decodeCompressedBase64(text)
                    ;(responseContent as any).textDecoded = decodedBase64
                } catch {
                    // Ignored: uncomment below to debug. It's fine to ignore this error because we only
                    // make a best-effort to decode the gzip+base64 encoded JSON payload. It's not needed
                    // for the HTTP replay to work correctly because we leave the `.text` property unchanged.
                    // console.error('base64 decode error', error)
                }
            }
        }
        return super.onSaveRecording(recordingId, recording)
    }

    private filterHeaders(headers: { name: string; value: string }[]): { name: string; value: string }[] {
        const removeHeaderNames = new Set(['set-cookie', 'server', 'via'])
        const removeHeaderPrefixes = ['x-trace', 'cf-']
        return headers.filter(
            header =>
                !removeHeaderNames.has(header.name) &&
                removeHeaderPrefixes.every(prefix => !header.name.startsWith(prefix))
        )
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
        let polly: Polly | undefined
        if (options.recordingDirectory) {
            if (options.recordingMode === undefined) {
                console.error('CODY_RECORDING_MODE is required when CODY_RECORDING_DIRECTORY is set.')
                process.exit(1)
            }
            Polly.register(CodyNodeHttpAdapter)
            Polly.register(CodyPersister)
            polly = new Polly(options.recordingName ?? 'CodyAgent', {
                flushRequestsOnStop: true,
                recordIfMissing: options.recordIfMissing ?? options.recordingMode === 'record',
                mode: options.recordingMode,
                adapters: ['node-http'],
                persister: 'cody-fs',
                recordFailedRequests: true,
                expiryStrategy: options.recordingExpiryStrategy,
                expiresIn: options.expiresIn,
                persisterOptions: {
                    keepUnusedRequests: true,
                    fs: {
                        recordingsDir: options.recordingDirectory,
                    },
                },
                matchRequestsBy: {
                    headers: false,
                    order: false,
                },
            })
            // Automatically pass through requests to download bfg binaries
            // because we don't want to record the binary downloads for
            // macOS/Windows/Linux
            polly.server.get('https://github.com/sourcegraph/bfg/*path').passthrough()
            polly.server.get('https://github.com/sourcegraph/symf/*path').passthrough()
        } else if (options.recordingMode) {
            console.error('CODY_RECORDING_DIRECTORY is required when CODY_RECORDING_MODE is set.')
            process.exit(1)
        }

        if (process.env.CODY_DEBUG === 'true') {
            process.stderr.write('Starting Cody Agent...\n')
        }

        const agent = new Agent({ polly })

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
