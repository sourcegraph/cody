import type { ClientRequest } from 'node:http'
import type { EventEmitter } from 'node:stream'
import {
    NEVER,
    type NetEventMap,
    authStatus,
    combineLatest,
    distinctUntilChanged,
    globalAgentRef,
    resolvedConfig,
    startWith,
    subscriptionDisposable,
    switchMap,
} from '@sourcegraph/cody-shared'
import { Observable, Subject, map } from 'observable-fns'
import stringify from 'safe-stable-stringify'
import * as vscode from 'vscode'
import type { DelegatingAgent } from '../net'
import type { authProvider } from './AuthProvider'
import type { CodyStatusBar } from './StatusBar'

type AuthProvider = typeof authProvider

interface NetworkDiagnosticsDeps {
    statusBar: CodyStatusBar | null
    agent: DelegatingAgent | null
    authProvider: AuthProvider
}

interface RequestEventHandlers {
    onResponse: (res: any) => void
    onTimeout: () => void
    onError: (error: Error) => void
    onClose: () => void
}

interface SocketEventHandlers {
    onConnect: () => void
    onClose: () => void
    onError: (error: Error) => void
}

let GLOBAL_REQUEST_COUNTER = 0

export class NetworkDiagnostics implements vscode.Disposable {
    private static singleton: NetworkDiagnostics | null = null
    private disposables: vscode.Disposable[] = []
    // We use a weak map here to prevent dangling requests
    private requestTimings = new WeakMap<ClientRequest, RequestTimings>()
    private _statusBar: Subject<CodyStatusBar | null> = new Subject()
    private outputChannel: vscode.LogOutputChannel

    //@ts-ignore
    private config = resolvedConfig.pipe(
        map(config => ({
            debugLoggingEnabled: config.configuration.debugVerbose,
        })),
        distinctUntilChanged((a, b) => a.debugLoggingEnabled === b.debugLoggingEnabled)
    )

    set statusBar(statusBar: CodyStatusBar | null) {
        this._statusBar.next(statusBar)
    }

    private constructor({ statusBar, agent, authProvider }: NetworkDiagnosticsDeps) {
        this.outputChannel = vscode.window.createOutputChannel('Cody: Network', { log: true })
        this.outputChannel.clear()

        this.disposables.push(
            ...this.setupAuthRefresh(authProvider, agent),
            ...this.setupStatusBar(statusBar, agent),
            ...this.setupNetworkLogging(agent, globalAgentRef.netEvents ?? null)
        )
    }

    static init(deps: NetworkDiagnosticsDeps): NetworkDiagnostics {
        if (NetworkDiagnostics.singleton) {
            throw new Error('NetworkDiagnostics already initialized')
        }
        NetworkDiagnostics.singleton = new NetworkDiagnostics(deps)
        return NetworkDiagnostics.singleton
    }

    private createRequestEventHandlers(
        req: ClientRequest,
        url: string | URL | undefined | null,
        protocol: string,
        agent: string | undefined | null
    ): RequestEventHandlers {
        return {
            onResponse: res => {
                const responseCleanup = this.setupResponseEvents(req, res)
                this.disposables.push(new vscode.Disposable(responseCleanup))
            },
            onTimeout: () => {
                const requestTimings = this.requestTimings.get(req)
                if (requestTimings) {
                    requestTimings.timeout = new Date()
                }
            },
            onError: error => {
                const requestTimings = this.requestTimings.get(req)
                if (requestTimings) {
                    requestTimings.error = new Date()
                    requestTimings.errorValue = error
                }
            },
            onClose: () => {
                const requestTimings = this.requestTimings.get(req)
                if (!requestTimings) {
                    return
                }
                requestTimings.close = new Date()
                this.logRequestCompletion(requestTimings, url, protocol, agent)
            },
        }
    }

    private createSocketEventHandlers(req: ClientRequest): SocketEventHandlers {
        return {
            onConnect: () => {
                const reqTiming = this.requestTimings.get(req)
                if (reqTiming?.socket) {
                    reqTiming.socket.connect = new Date()
                }
            },
            onClose: () => {
                const socketTimings = this.requestTimings.get(req)?.socket
                if (socketTimings) {
                    socketTimings.close = new Date()
                }
            },
            onError: error => {
                const socketTimings = this.requestTimings.get(req)?.socket
                if (socketTimings) {
                    socketTimings.error = new Date()
                    socketTimings.errorValue = error
                }
            },
        }
    }

    private setupResponseEvents(req: ClientRequest, res: any): () => void {
        const onResClose = () => {
            const responseTimings = this.requestTimings.get(req)?.response
            if (responseTimings) {
                responseTimings.close = new Date()
            }
        }

        const onResError = (error: Error) => {
            const responseTimings = this.requestTimings.get(req)?.response
            if (responseTimings) {
                responseTimings.error = new Date()
                responseTimings.errorValue = error
            }
        }

        res.once('close', onResClose)
        res.once('error', onResError)

        const requestTimings = this.requestTimings.get(req)
        if (requestTimings) {
            requestTimings.response = {
                start: new Date(),
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
            }
        }

        return () => {
            res.removeListener('close', onResClose)
            res.removeListener('error', onResError)
        }
    }

    private setupRequestEvents(
        req: ClientRequest,
        url: string | URL | undefined | null,
        protocol: string,
        agent: string | undefined | null
    ): () => void {
        const handlers = this.createRequestEventHandlers(req, url, protocol, agent)

        req.once('response', handlers.onResponse)
        req.once('timeout', handlers.onTimeout)
        req.once('error', handlers.onError)
        req.once('close', handlers.onClose)

        return () => {
            req.removeListener('response', handlers.onResponse)
            req.removeListener('timeout', handlers.onTimeout)
            req.removeListener('error', handlers.onError)
            req.removeListener('close', handlers.onClose)
        }
    }

    private setupSocketEvents(req: ClientRequest): (socket: any) => void {
        return socket => {
            const handlers = this.createSocketEventHandlers(req)

            socket.once('connect', handlers.onConnect)
            socket.once('close', handlers.onClose)
            socket.once('error', handlers.onError)

            const reqTiming = this.requestTimings.get(req)
            if (reqTiming) {
                reqTiming.socket = { start: new Date() }
            }

            this.disposables.push(
                new vscode.Disposable(() => {
                    socket.removeListener('connect', handlers.onConnect)
                    socket.removeListener('close', handlers.onClose)
                    socket.removeListener('error', handlers.onError)
                })
            )
        }
    }

    private logRequestCompletion(
        requestTimings: RequestTimings,
        url: string | URL | undefined | null,
        protocol: string,
        agent: string | undefined | null
    ): void {
        const timeline = formatTimeline(requestTimings)
        const logData = {
            id: requestTimings.id,
            url,
            protocol,
            agent,
            timeline,
            error: requestTimings.errorValue,
        }
        if (isExpectedNetworkTermination(requestTimings.errorValue)) {
            this.outputChannel.trace(log('Request Aborted', logData))
        } else if (
            requestTimings.error ||
            requestTimings.response?.error ||
            requestTimings.socket?.error
        ) {
            this.outputChannel.error(log('Request Finished with Error', logData))
        } else {
            this.outputChannel.debug(log('Request Finished', logData))
        }
    }

    private setupNetworkLogging(
        agent: DelegatingAgent | null,
        netEvents: EventEmitter<NetEventMap> | null
    ): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = []

        if (agent) {
            disposables.push(
                subscriptionDisposable(
                    agent.configurationError.subscribe(error => {
                        if (error) {
                            this.outputChannel.error(log('Configuration error', { error }))
                        }
                    })
                )
            )
        }

        if (netEvents) {
            disposables.push(
                vscode.commands.registerCommand('cody.debug.net.showOutputChannel', () => {
                    this.outputChannel.show()
                })
            )

            const requestHandler = ({ agent, protocol, url, req }: NetEventMap['request'][number]) => {
                const reqId = GLOBAL_REQUEST_COUNTER++
                this.outputChannel.trace(log('Request Created', { id: reqId, url, protocol, agent }))
                this.requestTimings.set(req, { id: reqId, start: new Date() })

                const cleanupRequest = this.setupRequestEvents(req, url, protocol, agent)
                req.once('socket', this.setupSocketEvents(req))

                this.disposables.push(new vscode.Disposable(cleanupRequest))
            }

            netEvents.on('request', requestHandler)
            disposables.push(
                new vscode.Disposable(() => {
                    netEvents.off('request', requestHandler)
                })
            )
        }

        return disposables
    }

    private setupAuthRefresh(authProvider: AuthProvider, agent: DelegatingAgent | null) {
        const netConfigVersionChanges = agent?.configVersion
        if (!netConfigVersionChanges) {
            return []
        }
        let previousConfigVersion: number | undefined
        return [
            subscriptionDisposable(
                combineLatest(authStatus, netConfigVersionChanges)
                    .pipe(
                        switchMap(([auth, netConfigVersion]) => {
                            if (previousConfigVersion === netConfigVersion) {
                                return NEVER
                            }
                            if (auth.pendingValidation) {
                                return NEVER
                            }
                            const isInitial = previousConfigVersion === undefined
                            previousConfigVersion = netConfigVersion
                            if (isInitial || auth.authenticated || !auth.error) {
                                return NEVER
                            }
                            return Observable.of(void 0)
                        })
                    )
                    .subscribe(() => {
                        authProvider.refresh()
                    })
            ),
        ]
    }

    private setupStatusBar(
        statusBar: CodyStatusBar | null,
        agent: DelegatingAgent | null
    ): vscode.Disposable[] {
        const observableStatusBar = Observable.from(this._statusBar).pipe(
            startWith(statusBar),
            distinctUntilChanged((a, b) => a === b)
        )
        const errorDisposers: (() => void)[] = []
        const cleanup = () => {
            for (const disposeFn of errorDisposers.splice(0, errorDisposers.length)) {
                try {
                    disposeFn()
                } catch {}
            }
        }
        const sub = combineLatest(
            observableStatusBar,
            agent?.configurationError ?? Observable.of(null)
        ).subscribe(
            ([statusBar, status]) => {
                cleanup()
                if (status && statusBar) {
                    errorDisposers.push(
                        statusBar.addError({
                            errorType: 'Networking',
                            description: status.message,
                            title: 'There is a problem with your network configuration.',
                            removeAfterSelected: false,
                            onSelect: () => {
                                vscode.commands.executeCommand('cody.debug.net.showOutputChannel')
                            },
                        })
                    )
                }
            },
            undefined,
            () => {
                cleanup()
            }
        )

        return [subscriptionDisposable(sub)]
    }

    dispose(): void {
        this.outputChannel.dispose()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
        NetworkDiagnostics.singleton = null
    }
}

function isExpectedNetworkTermination(unknownError: unknown): boolean {
    if (typeof unknownError !== 'object' || !unknownError) {
        return false
    }
    const error = unknownError as { name?: unknown; code?: unknown }
    return (
        error?.name === 'AbortError' ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ERR_STREAM_DESTROYED'
    )
}

function log(message: string, { id, ...data }: { id?: number } & Record<string, any>): string {
    return [`${id !== undefined ? `req<${id}>: ` : ''}${message.trim()}`, stringifyWithErrors(data)]
        .filter(Boolean)
        .join('\t')
}

function stringifyWithErrors(obj: object) {
    return stringify(obj, (key, value) => {
        if (value instanceof Error) {
            return Object.getOwnPropertyNames(value).reduce((acc, prop) => {
                //@ts-ignore
                acc[prop] = value[prop]
                return acc
            }, {})
        }
        return value
    })
}

function formatTimeline(timings: RequestTimings): string {
    const events: Array<[number, string]> = []
    const start = timings.start.getTime()

    events.push([0, 'start'])
    if (timings.socket?.start) events.push([timings.socket.start.getTime() - start, 'socket'])
    if (timings.socket?.connect) events.push([timings.socket.connect.getTime() - start, 'connected'])
    if (timings.response?.start)
        events.push([
            timings.response.start.getTime() - start,
            `response ${timings.response.statusCode}`,
        ])
    if (timings.error) events.push([timings.error.getTime() - start, 'error'])
    if (timings.timeout) events.push([timings.timeout.getTime() - start, 'timeout'])
    if (timings.close) events.push([timings.close.getTime() - start, 'close'])

    // Sort by timestamp
    events.sort((a, b) => a[0] - b[0])

    return events.map(([ms, event]) => `${event}@${ms}ms`).join(' → ')
}

interface RequestTimings {
    id: number
    start: Date
    timeout?: Date
    error?: Date
    errorValue?: Error
    close?: Date
    response?: {
        start?: Date
        close?: Date
        error?: Date
        statusCode?: number
        statusMessage?: string
        errorValue?: Error
    }
    socket?: {
        start?: Date
        connect?: Date
        close?: Date
        error?: Date
        errorValue?: Error
    }
}
