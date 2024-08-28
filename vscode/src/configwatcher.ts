import {
    type ClientConfigurationWithAccessToken,
    type ConfigWatcher,
    fromVSCodeEvent,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { getFullConfig } from './configuration'
import type { AuthProvider } from './services/AuthProvider'

export class BaseConfigWatcher implements ConfigWatcher<ClientConfigurationWithAccessToken> {
    private currentConfig: ClientConfigurationWithAccessToken
    private disposables: vscode.Disposable[] = []
    private configChangeEvent = new vscode.EventEmitter<ClientConfigurationWithAccessToken>()

    public static async create(
        authProvider: AuthProvider,
        disposables: vscode.Disposable[]
    ): Promise<ConfigWatcher<ClientConfigurationWithAccessToken>> {
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

    constructor(initialConfig: ClientConfigurationWithAccessToken) {
        this.currentConfig = initialConfig
        this.disposables.push(this.configChangeEvent)
    }

    public changes: Observable<ClientConfigurationWithAccessToken> = fromVSCodeEvent(
        this.configChangeEvent.event,
        () => this.currentConfig
    )

    public dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public get(): ClientConfigurationWithAccessToken {
        return this.currentConfig
    }

    private set(config: ClientConfigurationWithAccessToken): void {
        const oldConfig = JSON.stringify(this.currentConfig)
        const newConfig = JSON.stringify(config)
        if (oldConfig === newConfig) {
            return
        }

        this.currentConfig = config
        this.configChangeEvent.fire(config)
    }
}
