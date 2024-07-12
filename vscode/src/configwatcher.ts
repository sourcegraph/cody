import type { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

/**
 * A wrapper around a configuration source that lets the client retrieve the current config and watch for changes.
 */
export interface ConfigWatcher<C> extends vscode.Disposable {
    get(): C

    // NOTE(beyang): should remove this
    set(c: C): void

    /*
     * Register a callback that is called only when Cody's configuration is changed.
     * Appends to the disposable array methods that unregister the callback
     */
    onChange(callback: (config: C) => Promise<void>, disposables: vscode.Disposable[]): void

    /**
     * Same behavior as onChange, but fires the callback once immediately for initialization.
     */
    initAndOnChange(
        callback: (config: C) => Promise<void>,
        disposables: vscode.Disposable[]
    ): Promise<void>
}

export class BaseConfigWatcher implements ConfigWatcher<ConfigurationWithAccessToken> {
    private currentConfig: ConfigurationWithAccessToken
    private disposables: vscode.Disposable[] = []
    private configChangeEvent: vscode.EventEmitter<ConfigurationWithAccessToken>

    public static async create(
        getConfig: () => Promise<ConfigurationWithAccessToken>,
        disposables: vscode.Disposable[]
    ): Promise<ConfigWatcher<ConfigurationWithAccessToken>> {
        const w = new BaseConfigWatcher(await getConfig())
        disposables.push(
            vscode.workspace.onDidChangeConfiguration(async event => {
                if (!event.affectsConfiguration('cody')) {
                    return
                }
                w.set(await getConfig())
            })
        )
        disposables.push(w)

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

    public set(config: ConfigurationWithAccessToken): void {
        const oldConfig = JSON.stringify(this.currentConfig)
        const newConfig = JSON.stringify(config)
        if (oldConfig === newConfig) {
            return
        }

        this.currentConfig = config
        this.configChangeEvent.fire(config)
    }

    get(): ConfigurationWithAccessToken {
        return this.currentConfig
    }

    async initAndOnChange(
        callback: (config: ConfigurationWithAccessToken) => Promise<void>,
        disposables: vscode.Disposable[]
    ): Promise<void> {
        await callback(this.currentConfig)
        this.onChange(callback, disposables)
    }

    public onChange(
        callback: (config: ConfigurationWithAccessToken) => Promise<void>,
        disposables: vscode.Disposable[]
    ): void {
        disposables.push(this.configChangeEvent.event(callback))
    }
}
