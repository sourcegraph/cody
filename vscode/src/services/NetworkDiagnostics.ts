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

let GLOBAL_REQUEST_COUNTER = 0

export class NetworkDiagnostics implements vscode.Disposable {
    private static singleton: NetworkDiagnostics | null = null
    private disposables: vscode.Disposable[] = []
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

    private setupResponseEvents(res: any, requestTimings: RequestTimings) {
        requestTimings.response = {
            start: new Date(),
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
        }

        res.once('close', () => {
            const responseTimings = requestTimings.response
            if (responseTimings) {
                responseTimings.close = new Date()
            }
        })
        res.once('error', (error: Error) => {
            const responseTimings = requestTimings.response
            if (responseTimings) {
                responseTimings.error = new Date()
                responseTimings.errorValue = error
            }
        })
    }

    private setupRequestEvents(
        req: ClientRequest,
        url: string | URL | undefined | null,
        protocol: string,
        agent: string | undefined | null,
        requestTimings: RequestTimings
    ) {
        req.once('response', res => {
            this.setupResponseEvents(res, requestTimings)
        })
        req.once('timeout', () => {
            requestTimings.timeout = new Date()
        })
        req.once('error', error => {
            requestTimings.error = new Date()
            requestTimings.errorValue = error
        })
        req.once('close', () => {
            requestTimings.close = new Date()
            this.logRequestCompletion(requestTimings, url, protocol, agent)
        })
    }

    private setupSocketEvents(requestTimings: RequestTimings): (socket: any) => void {
        return socket => {
            requestTimings.socket = { start: new Date() }

            socket.once('connect', () => {
                if (requestTimings.socket) {
                    requestTimings.socket.connect = new Date()
                }
            })
            socket.once('close', () => {
                if (requestTimings.socket) {
                    requestTimings.socket.close = new Date()
                }
            })
            socket.once('error', (error: Error) => {
                if (requestTimings.socket) {
                    requestTimings.socket.error = new Date()
                    requestTimings.socket.errorValue = error
                }
            })
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

            netEvents.on('request', ({ agent, protocol, url, req }) => {
                const reqId = GLOBAL_REQUEST_COUNTER++
                const requestTimings = { id: reqId, start: new Date() }

                this.outputChannel.trace(log('Request Created', { id: reqId, url, protocol, agent }))

                this.setupRequestEvents(req, url, protocol, agent, requestTimings)
                req.once('socket', this.setupSocketEvents(requestTimings))
            })
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
