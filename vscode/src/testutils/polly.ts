import { execSync } from 'child_process'
import path from 'path'

import { Polly, type EXPIRY_STRATEGY, type MODE } from '@pollyjs/core'

import { CodyNodeHttpAdapter } from './CodyNodeHttpAdapter'
import { CodyPersister } from './CodyPersister'

interface PollyOptions {
    recordingName: string
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
}

function defaultPollyOptions(options: Pick<PollyOptions, 'recordingName' | 'recordingDirectory'>): PollyOptions {
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
        const rootDirectory = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
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
