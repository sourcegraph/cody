import {
    type ConfigurationWithAccessToken,
    fromVSCodeEvent,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { getFullConfig } from './configuration'
import type { AuthProvider } from './services/AuthProvider'

/**
 * A wrapper around a configuration source that lets the client retrieve the current config and watch for changes.
 */
export interface ConfigWatcher<C> extends vscode.Disposable {
    changes: Observable<C>
    get(): C
}

export class BaseConfigWatcher implements ConfigWatcher<ConfigurationWithAccessToken> {
    private currentConfig: ConfigurationWithAccessToken
    private disposables: vscode.Disposable[] = []
    private configChangeEvent = new vscode.EventEmitter<ConfigurationWithAccessToken>()

    public static async create(
        authProvider: AuthProvider,
        disposables: vscode.Disposable[]
    ): Promise<ConfigWatcher<ConfigurationWithAccessToken>> {
        const w = new BaseConfigWatcher(await getFullConfig())
        disposables.push(w)
        disposables.push(
            vscode.workspace.onDidChangeConfiguration(async event => {
                if (!event.affectsConfiguration('cody')) {
                    return
                }
                w.set(await getFullConfig())
            })
        )
        disposables.push(
            subscriptionDisposable(
                authProvider.changes.subscribe(async () => {
                    w.set(await getFullConfig())
                })
            )
        )

        return w
    }

    constructor(initialConfig: ConfigurationWithAccessToken) {
        this.currentConfig = initialConfig
        this.disposables.push(this.configChangeEvent)
    }

    public changes: Observable<ConfigurationWithAccessToken> = fromVSCodeEvent(
        this.configChangeEvent.event,
        () => this.currentConfig
    )

    public dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public get(): ConfigurationWithAccessToken {
        return this.currentConfig
    }

    private set(config: ConfigurationWithAccessToken): void {
        const oldConfig = JSON.stringify(this.currentConfig)
        const newConfig = JSON.stringify(config)
        if (oldConfig === newConfig) {
            return
        }

        this.currentConfig = config
        this.configChangeEvent.fire(config)
    }
}
