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

export class NetworkDiagnostics implements vscode.Disposable {
    private static singleton: NetworkDiagnostics | null = null

    private disposables: vscode.Disposable[] = []
    // private netEvents: NetworkDiagnosticsDeps['netEvents']
    // private agent?: NetworkDiagnosticsDeps['agent']
    //@ts-ignore

    private _statusBar: Subject<CodyStatusBar | null> = new Subject()
    private config = resolvedConfig.pipe(
        map(config => ({
            debugLoggingEnabled: config.configuration.debugVerbose,
        })),
        distinctUntilChanged()
    )
    private outputChannel: vscode.LogOutputChannel

    //allows setting late
    set statusBar(statusBar: CodyStatusBar | null) {
        this._statusBar.next(statusBar)
    }

    private constructor({ statusBar, agent, authProvider }: NetworkDiagnosticsDeps) {
        this.outputChannel = vscode.window.createOutputChannel('Cody: Network', { log: true })
        this.outputChannel.clear()

        this.disposables.push(...this.setupAuthRefresh(authProvider, agent))
        this.disposables.push(...this.setupStatusBar(statusBar, agent))
        this.disposables.push(...this.setupNetworkLogging(agent, globalAgentRef.netEvents ?? null))
    }

    static init(deps: NetworkDiagnosticsDeps): NetworkDiagnostics {
        if (NetworkDiagnostics.singleton) {
            throw new Error('NetworkDiagnostics already initialized')
        }
        NetworkDiagnostics.singleton = new NetworkDiagnostics(deps)
        return NetworkDiagnostics.singleton
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

    private setupNetworkLogging(
        agent: DelegatingAgent | null,
        netEvents: EventEmitter<NetEventMap> | null
    ): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = []
        if (agent) {
            const sub = subscriptionDisposable(
                agent.configurationError.subscribe(error => {
                    if (error) {
                        this.outputChannel.error(log('Configuration error', { error }))
                    }
                })
            )
            disposables.push(sub)
        }

        if (netEvents) {
            disposables.push(
                vscode.commands.registerCommand('cody.debug.net.showOutputChannel', () => {
                    this.outputChannel.show()
                })
            )
            const handler = (...[{ agent, protocol, url, req }]: NetEventMap['request']) => {
                this.outputChannel.trace(log('Request Created', { url, protocol, agent }))
                const requestTimings: RequestTimings = {
                    start: new Date(),
                }
                req.once('socket', socket => {
                    const socketTimings: RequestTimings['socket'] = {
                        start: new Date(),
                    }
                    socket.once('connect', () => {
                        socketTimings.connect = new Date()
                    })
                    socket.once('close', () => {
                        socketTimings.close = new Date()
                    })
                    socket.once('error', error => {
                        socketTimings.error = new Date()
                        socketTimings.errorValue = error
                    })
                    requestTimings.socket = socketTimings
                })
                req.once('response', res => {
                    const responseTimings: RequestTimings['response'] = {
                        start: new Date(),
                        statusCode: res.statusCode,
                        statusMessage: res.statusMessage,
                    }
                    res.once('close', () => {
                        responseTimings.close = new Date()
                    })
                    res.once('error', error => {
                        responseTimings.error = new Date()
                        responseTimings.errorValue = error
                    })

                    requestTimings.response = responseTimings
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
                    if (
                        requestTimings.error ||
                        requestTimings.response?.error ||
                        requestTimings.socket?.error
                    ) {
                        this.outputChannel.error(
                            log('Request Finished with Error', {
                                url,
                                protocol,
                                agent,
                                timings: requestTimings,
                            })
                        )
                    } else {
                        this.outputChannel.debug(
                            log('Request Finished', { url, protocol, agent, timings: requestTimings })
                        )
                    }
                })
            }
            netEvents.on('request', handler)
            disposables.push(
                vscode.Disposable.from({
                    dispose() {
                        netEvents.off('request', handler)
                    },
                })
            )
        }

        combineLatest(this.config).subscribe(
            () => {},
            undefined,
            () => {}
        )
        return []
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

    dispose() {
        this.outputChannel.dispose()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
        NetworkDiagnostics.singleton = null
    }
}

function log(message: string, data: Record<string, any> = {}): string {
    const timestamp = new Date().toISOString()
    return (
        stringifyWithErrors({
            message,
            ...data,
            timestamp,
        }) ?? ''
    )
}

function stringifyWithErrors(obj: object) {
    return stringify(
        obj,
        (key, value) => {
            if (value instanceof Error) {
                return Object.getOwnPropertyNames(value).reduce((acc, prop) => {
                    //@ts-ignore
                    acc[prop] = value[prop]
                    return acc
                }, {})
            }
            return value
        },
        2
    )
}

interface RequestTimings {
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
