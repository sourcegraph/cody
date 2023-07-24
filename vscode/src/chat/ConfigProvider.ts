import * as vscode from 'vscode'

import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'

import { getFullConfig } from '../configuration'
import { debug } from '../log'
import { AuthProvider } from '../services/AuthProvider'
import { logEvent } from '../services/EventLogger'
import { LocalStorage } from '../services/LocalStorageProvider'
import { SecretStorage } from '../services/SecretStorageProvider'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { ConfigurationSubsetForWebview, DOTCOM_URL, isLocalApp, LocalEnv } from './protocol'

export type Config = Pick<
    ConfigurationWithAccessToken,
    | 'codebase'
    | 'serverEndpoint'
    | 'debugEnable'
    | 'debugFilter'
    | 'debugVerbose'
    | 'customHeaders'
    | 'accessToken'
    | 'useContext'
    | 'experimentalChatPredictions'
    | 'experimentalGuardrails'
    | 'experimentalCustomRecipes'
    | 'pluginsEnabled'
    | 'pluginsConfig'
    | 'pluginsDebugEnabled'
>

export enum ContextEvent {
    Auth = 'auth',
}

export class ConfigProvider implements vscode.Disposable {
    // We fire messages from ContextProvider to the sidebar webview.
    // TODO(umpox): Should we add support for showing context in other places (i.e. within inline chat)?
    public webview?: ChatViewProviderWebview

    // Fire event to let subscribers know that the configuration has changed
    public configurationChangeEvent = new vscode.EventEmitter<void>()

    protected disposables: vscode.Disposable[] = []

    constructor(
        public config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        private secretStorage: SecretStorage,
        private localStorage: LocalStorage,
        private authProvider: AuthProvider
    ) {
        this.disposables.push(this.configurationChangeEvent)
        this.disposables.push(vscode.commands.registerCommand('cody.auth.sync', () => this.syncAuthStatus()))
    }

    public onConfigurationChange(newConfig: Config): void {
        debug('ContextProvider:onConfigurationChange', '')
        this.config = newConfig
        const authStatus = this.authProvider.getAuthStatus()
        if (authStatus.endpoint) {
            this.config.serverEndpoint = authStatus.endpoint
        }
        this.configurationChangeEvent.fire()
    }

    /**
     * Save, verify, and sync authStatus between extension host and webview
     * activate extension when user has valid login
     */
    public async syncAuthStatus(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        // Update config to the latest one and fire configure change event to update external services
        const newConfig = await getFullConfig(this.secretStorage, this.localStorage)
        await this.publishConfig()
        this.onConfigurationChange(newConfig)
        // When logged out, user's endpoint will be set to null
        const isLoggedOut = !authStatus.isLoggedIn && !authStatus.endpoint
        const isAppEvent = isLocalApp(authStatus.endpoint || '') ? 'app:' : ''
        const eventValue = isLoggedOut ? 'disconnected' : authStatus.isLoggedIn ? 'connected' : 'failed'
        // e.g. auth:app:connected, auth:app:disconnected, auth:failed
        this.sendEvent(ContextEvent.Auth, isAppEvent + eventValue)
    }

    /**
     * Publish the config to the webview.
     */
    private async publishConfig(): Promise<void> {
        const send = async (): Promise<void> => {
            this.config = await getFullConfig(this.secretStorage, this.localStorage)

            // check if the new configuration change is valid or not
            const authStatus = this.authProvider.getAuthStatus()
            const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
            const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
                ...localProcess,
                debugEnable: this.config.debugEnable,
                serverEndpoint: this.config.serverEndpoint,
                pluginsEnabled: this.config.pluginsEnabled,
                pluginsDebugEnabled: this.config.pluginsDebugEnabled,
            }

            await this.webview?.postMessage({ type: 'config', config: configForWebview, authStatus })
            debug('Cody:publishConfig', 'configForWebview', { verbose: configForWebview })
        }

        this.disposables.push(this.configurationChangeEvent.event(() => send()))
        await send()
    }

    /**
     * Log Events - naming convention: source:feature:action
     */
    public sendEvent(event: ContextEvent, value: string): void {
        const endpoint = this.config.serverEndpoint || DOTCOM_URL.href
        const endpointUri = { serverEndpoint: endpoint }
        switch (event) {
            case 'auth':
                logEvent(`CodyVSCodeExtension:Auth:${value}`, endpointUri, endpointUri)
                break
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
