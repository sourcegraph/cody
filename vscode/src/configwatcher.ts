import {
    type ConfigurationWithAccessToken,
    asyncGeneratorFromVSCodeEvent,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getFullConfig } from './configuration'
import type { AuthProvider } from './services/AuthProvider'

interface OnChangeOptions {
    runImmediately: boolean
}

/**
 * A wrapper around a configuration source that lets the client retrieve the current config and watch for changes.
 */
export interface ConfigWatcher<C> extends vscode.Disposable {
    get(): C

    /*
     * Register a callback that is called only when Cody's configuration is changed.
     * Appends to the disposable array methods that unregister the callback.
     *
     * If `runImmediately` is true, the callback is called immediately and the returned
     * Promise is that of the callback. If false (the default), then the return value
     * is a resolved Promise.
     */
    onChange(
        callback: (config: C) => Promise<void>,
        disposables: vscode.Disposable[],
        options?: OnChangeOptions
    ): Promise<void>

    observe(signal?: AbortSignal): AsyncGenerator<C>
}

export class BaseConfigWatcher implements ConfigWatcher<ConfigurationWithAccessToken> {
    private currentConfig: ConfigurationWithAccessToken
    private disposables: vscode.Disposable[] = []
    private configChangeEvent: vscode.EventEmitter<ConfigurationWithAccessToken>

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
            authProvider.onChange(async () => {
                w.set(await getFullConfig())
            })
        )

        return w
    }

    constructor(initialConfig: ConfigurationWithAccessToken) {
        this.currentConfig = initialConfig
        this.configChangeEvent = new vscode.EventEmitter()
        this.disposables.push(this.configChangeEvent)
    }

    public dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public get(): ConfigurationWithAccessToken {
        return this.currentConfig
    }

    public async onChange(
        callback: (config: ConfigurationWithAccessToken) => Promise<void>,
        disposables: vscode.Disposable[],
        { runImmediately }: OnChangeOptions = { runImmediately: false }
    ): Promise<void> {
        disposables.push(this.configChangeEvent.event(callback))
        if (runImmediately) {
            await callback(this.currentConfig)
        }
    }

    public observe(signal?: AbortSignal): AsyncGenerator<ConfigurationWithAccessToken> {
        return asyncGeneratorFromVSCodeEvent(this.configChangeEvent.event, this.currentConfig, signal)
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
