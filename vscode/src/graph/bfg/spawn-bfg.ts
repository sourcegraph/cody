import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { captureException } from '@sentry/core'
import {
    type ExtensionContext,
    type Unsubscribable,
    authStatus,
    catchError,
    combineLatest,
    createDisposables,
    distinctUntilChanged,
    firstValueFrom,
    isDotCom,
    isError,
    type pendingOperation,
    pluck,
    promiseFactoryToObservable,
    promiseToObservable,
    resolvedConfig,
    skipPendingOperation,
    switchMap,
    switchMapOperation,
    switchMapReplayOperation,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node'
import { MessageHandler } from '../../jsonrpc/jsonrpc'
import { logDebug, logError } from '../../log'
import { getBfgPath } from './download-bfg'

/**
 * Global singleton accessor for the cody-engine message handler.
 *
 * It reuses the same process for multiple subscribers and kills the process when there are no more
 * subscribers, so subscribers should take care to unsubscribe when they no longer need it.
 *
 * If there is an initialization error, subscribers will continue to receive the same error until
 * the auth status changes. This is to avoid crash loops where we repeatedly try to initialize
 * cody-engine and fail for the same reason, which could make Cody unresponsive.
 */
export function useCodyEngine(setup: (codyEngine: MessageHandler) => Promise<void>): CodyEngineHandle {
    const subscription = codyEngine
        .pipe(
            switchMapOperation((codyEngine): Observable<MessageHandler | Error | null> => {
                if (codyEngine && !isError(codyEngine)) {
                    return promiseToObservable(setup(codyEngine)).pipe(
                        map(() => codyEngine),
                        catchError(error =>
                            Observable.of(isError(error) ? error : new Error(String(error)))
                        )
                    )
                }
                return Observable.of(codyEngine)
            })
        )
        .subscribe({})
    return {
        get: () => firstValueFrom(codyEngine),
        subscription,
    }
}

export interface CodyEngineHandle {
    get(): Promise<MessageHandler | Error | null>
    subscription: Unsubscribable
}

const codyEngine: Observable<MessageHandler | null | Error> = combineLatest([
    resolvedConfig.pipe(pluck('extensionContext'), distinctUntilChanged()),
    authStatus.pipe(
        map(({ authenticated, endpoint }) => ({ authenticated, endpoint })),
        distinctUntilChanged()
    ),
]).pipe(
    switchMapReplayOperation(([extensionContext, authStatus]) => {
        if (!authStatus.authenticated || !isDotCom(authStatus.endpoint)) {
            // cody-engine is only used for dotcom.
            return Observable.of(null)
        }

        return promiseToObservable(spawnAndInitializeCodyEngine({ extensionContext })).pipe(
            createDisposables(handler => (isError(handler) || !handler ? undefined : handler)),
            switchMap((handler): Observable<MessageHandler | Error | typeof pendingOperation> => {
                if (isError(handler)) {
                    return Observable.of(handler)
                }

                // Keep the access token updated.
                return resolvedConfig.pipe(
                    pluck('auth'),
                    distinctUntilChanged(),
                    switchMapReplayOperation(auth =>
                        promiseFactoryToObservable(async () => {
                            // Be extra safe and check again here that this is being used against dotcom, to
                            // avoid sending non-dotcom access tokens to dotcom.
                            const accessToken = isDotCom(auth.serverEndpoint) ? auth.accessToken : null
                            await handler.request('embeddings/set-token', accessToken ?? '')
                            return handler
                        })
                    )
                )
            })
        )
    }),
    skipPendingOperation()
)

async function spawnAndInitializeCodyEngine({
    extensionContext,
}: {
    extensionContext: ExtensionContext
}): Promise<MessageHandler | Error> {
    logDebug('CodyEngine', 'Spawning and initializing')

    const codyrpc = await getBfgPath(extensionContext)
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
        if (code !== null && code !== 0) {
            logError('CodyEngine', `Exited with error code ${code}`)
            captureException(new Error(`CodyEngine: exited with error code ${code}`))
        }
    })
    child.stderr.pipe(process.stderr)

    const conn = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin)
    )
    handler = new MessageHandler(conn)
    try {
        conn.listen()
        handler.onDispose(() => {
            conn.dispose()
            child.kill()
        })
        await handler.request('bfg/initialize', { clientName: 'vscode' })
        return handler
    } catch (error) {
        handler.dispose()
        conn.dispose()
        logDebug('CodyEngine', 'Failed to spawn and initialize', error)
        captureException(error)
        return isError(error) ? error : new Error(String(error))
    }
}
