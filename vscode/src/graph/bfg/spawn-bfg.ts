import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { captureException } from '@sentry/core'
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node'
import { MessageHandler } from '../../jsonrpc/jsonrpc'
import { logDebug, logError } from '../../log'
import { getBfgPath } from './download-bfg'

/** Global singleton for the cody-engine child process channel. */
let codyEngine: Promise<MessageHandler> | null = null

/**
 * Spawn and initialize cody-engine, reusing the existing connection if it has already been spawned
 * and has not exited.
 */
export async function startCodyEngine(
    context: vscode.ExtensionContext
): Promise<MessageHandler & vscode.Disposable> {
    if (!codyEngine) {
        const onDispose = () => {
            logDebug('CodyEngine', 'Disposing')
            codyEngine = null
        }
        codyEngine = spawnAndInitializeCodyEngine(context, onDispose)
    }
    return codyEngine
}

async function spawnAndInitializeCodyEngine(
    context: vscode.ExtensionContext,
    onDispose: () => void
): Promise<MessageHandler> {
    logDebug('CodyEngine', 'Spawning and initializing')

    const codyrpc = await getBfgPath(context)
    if (!codyrpc) {
        throw new Error(
            'Failed to download BFG binary. To fix this problem, set the "cody.experimental.cody-engine.path" configuration to the path of your BFG binary'
        )
    }
    const isVerboseDebug = vscode.workspace.getConfiguration().get<boolean>('cody.debug.verbose', false)
    const child = child_process.spawn(codyrpc, {
        stdio: 'pipe',
        env: {
            ...process.env,
            VERBOSE_DEBUG: `${isVerboseDebug}`,
            RUST_BACKTRACE: isVerboseDebug ? '1' : '0',
            // See bfg issue 138
            RUST_LIB_BACKTRACE: '0',
        },
    })
    child.stderr.on('data', chunk => {
        logDebug('CodyEngine', 'spawnBfg:stderr', { verbose: chunk.toString() })
    })
    child.on('error', error => {
        captureException(error)
        logError('CodyEngine', 'spawnBfg:error', error)
    })
    let handler: MessageHandler | undefined
    child.on('exit', code => {
        handler?.exit()
        if (code !== 0) {
            logError('CodyEngine', 'Exited with error code', code)
            captureException(new Error(`CodyEngine: exited with error code ${code}`))
        }
    })
    child.stderr.pipe(process.stderr)

    try {
        const conn = createMessageConnection(
            new StreamMessageReader(child.stdout),
            new StreamMessageWriter(child.stdin)
        )
        handler = new MessageHandler(conn)
        conn.listen()
        handler.onDispose(() => {
            onDispose()
            conn.dispose()
            child.kill()
        })
        await handler.request('bfg/initialize', { clientName: 'vscode' })
        return handler
    } catch (error) {
        captureException(error)
        throw error
    }
}
