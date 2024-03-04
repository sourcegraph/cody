import { execSync } from 'child_process'
import path from 'path'

import { type EXPIRY_STRATEGY, type MODE, Polly } from '@pollyjs/core'

import { CodyNodeHttpAdapter } from './CodyNodeHttpAdapter'
import { CodyPersister, redactAccessToken } from './CodyPersister'

interface PollyOptions {
    recordingName: string
    keepUnusedRecordings?: boolean
    recordingDirectory?: string
    recordIfMissing?: boolean
    recordingMode?: MODE
    recordingExpiryStrategy?: EXPIRY_STRATEGY
    expiresIn?: string | null
}

export function startPollyRecording(userOptions: PollyOptions): Polly {
    const options = defaultPollyOptions(userOptions)
    Polly.register(CodyNodeHttpAdapter)
    Polly.register(CodyPersister)
    return new Polly(options.recordingName ?? 'CodyAgent', {
        flushRequestsOnStop: true,
        recordIfMissing: options.recordIfMissing ?? options.recordingMode === 'record',
        mode: options.recordingMode,
        adapters: ['node-http'],
        persister: 'cody-fs',
        recordFailedRequests: true,
        expiryStrategy: options.recordingExpiryStrategy,
        expiresIn: options.expiresIn,
        persisterOptions: {
            keepUnusedRequests: options.keepUnusedRecordings ?? true,
            fs: {
                recordingsDir: options.recordingDirectory,
            },
        },
        matchRequestsBy: {
            order: false,

            // The logic below is a bit tricky to follow. Simplified, we need to
            // ensure that Polly generates the same request ID regardless if
            // we're running in record mode (with an access token) or in replay
            // mode (with a redacted token). The ID is computed by Polly as the
            // MD5 digest of all request "identifiers", which a JSON object that
            // includes a "headers" property from the result of the function
            // below. To better understand what's going on, it's helpful to read
            // the implementation of Polly here:
            //   https://sourcegraph.com/github.com/Netflix/pollyjs@9b6bede12b7ee998472b8883c9dd01e2159e00a8/-/blob/packages/@pollyjs/core/src/-private/request.js?L281
            headers(headers) {
                // Step 1: get the authorization token as a plain string
                let token = ''
                const { authorization } = headers
                if (
                    authorization !== undefined &&
                    typeof authorization[Symbol.iterator] === 'function'
                ) {
                    token = [...authorization].at(0) ?? ''
                } else if (typeof authorization === 'string') {
                    // token = authorization
                }
                // Step 2: if the token is unredacted, redact it so that the ID
                // is the same regardless if we're in record or replay mode.
                if (!token.startsWith('token REDACTED')) {
                    return { authorization: [redactAccessToken(token)] }
                }

                // We are most likely running in replay mode and don't need to
                // customize how the token is digested.
                return { authorization }
            },
        },
    })
}

function defaultPollyOptions(
    options: Pick<PollyOptions, 'recordingName' | 'recordingDirectory'>
): PollyOptions {
    let recordingMode: MODE = 'replay'
    switch (process.env.CODY_RECORDING_MODE) {
        case 'record':
        case 'replay':
        case 'passthrough':
        case 'stopped':
            recordingMode = process.env.CODY_RECORDING_MODE
            break
        default:
            if (typeof process.env.CODY_RECORDING_MODE === 'string') {
                throw new TypeError(
                    `Not a valid recording mode '${process.env.CODY_RECORDING_MODE}'. Valid options are record, replay, passthrough, or stopped.`
                )
            }
    }
    const recordingDirectory = (): string => {
        const rootDirectory = execSync('git rev-parse --show-toplevel', {
            encoding: 'utf-8',
        }).trim()
        return path.join(rootDirectory, 'recordings')
    }
    return {
        recordIfMissing: process.env.CODY_RECORD_IF_MISSING === 'true' || recordingMode === 'record',
        recordingMode,
        recordingDirectory: options.recordingDirectory ?? recordingDirectory(),
        expiresIn: '365d',
        recordingExpiryStrategy: 'error',
        ...options,
    }
}
