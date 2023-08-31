import * as vscode from 'vscode'

import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { DOTCOM_URL, isLocalApp, LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { ChatViewProviderWebview } from '../chat/ChatViewProvider'
import {
    AuthStatus,
    defaultAuthStatus,
    isLoggedIn as isAuthed,
    networkErrorAuthStatus,
    unauthenticatedStatus,
} from '../chat/protocol'
import { newAuthStatus } from '../chat/utils'
import { debug } from '../log'

import { AuthMenu, showAccessTokenInputBox, showInstanceURLInputBox } from './AuthMenus'
import { LocalAppDetector } from './LocalAppDetector'
import { localStorage } from './LocalStorageProvider'
import { secretStorage } from './SecretStorageProvider'

export class AuthProvider {
    private endpointHistory: string[] = []

    private appScheme = vscode.env.uriScheme
    private client: SourcegraphGraphQLAPIClient | null = null
    public appDetector: LocalAppDetector

    private authStatus: AuthStatus = defaultAuthStatus
    public webview?: ChatViewProviderWebview

    constructor(
        private config: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'accessToken' | 'customHeaders'>,
        private telemetryService: TelemetryService
    ) {
        this.authStatus.endpoint = 'init'
        this.loadEndpointHistory()
        this.appDetector = new LocalAppDetector(secretStorage, { onChange: type => this.syncLocalAppState(type) })
    }

    // Sign into the last endpoint the user was signed into
    // if none, try signing in with App URL
    public async init(): Promise<void> {
        await this.appDetector.init()
        const lastEndpoint = localStorage?.getEndpoint() || this.config.serverEndpoint
        const token = (await secretStorage.get(lastEndpoint || '')) || this.config.accessToken
        debug('AuthProvider:init:lastEndpoint', lastEndpoint)
        const authState = await this.auth(lastEndpoint, token || null)
        if (authState?.isLoggedIn) {
            return
        }
    }

    // Display quickpick to select endpoint to sign in to
    public async signinMenu(type?: 'enterprise' | 'dotcom' | 'token' | 'app', uri?: string): Promise<void> {
        const mode = this.authStatus.isLoggedIn ? 'switch' : 'signin'
        debug('AuthProvider:signinMenu', mode)
        this.telemetryService.log('CodyVSCodeExtension:login:clicked')
        const item = await AuthMenu(mode, this.endpointHistory)
        if (!item) {
            return
        }
        const menuID = type || item?.id
        this.telemetryService.log('CodyVSCodeExtension:auth:selectSigninMenu', { menuID })
        switch (menuID) {
            case 'enterprise': {
                const instanceUrl = await showInstanceURLInputBox(item.uri)
                if (!instanceUrl) {
                    return
                }
                this.authStatus.endpoint = instanceUrl
                this.redirectToEndpointLogin(instanceUrl)
                break
            }
            case 'dotcom':
                this.redirectToEndpointLogin(DOTCOM_URL.href)
                break
            case 'token': {
                const instanceUrl = await showInstanceURLInputBox(uri || item.uri)
                if (!instanceUrl) {
                    return
                }
                await this.signinMenuForInstanceUrl(instanceUrl)
                break
            }
            case 'app': {
                if (uri) {
                    await this.appAuth(uri)
                }
                break
            }
            default: {
                // Auto log user if token for the selected instance was found in secret
                const selectedEndpoint = item.uri
                const tokenKey = isLocalApp(selectedEndpoint) ? 'SOURCEGRAPH_CODY_APP' : selectedEndpoint
                const token = await secretStorage.get(tokenKey)
                const authStatus = await this.auth(selectedEndpoint, token || null)
                this.showIsLoggedIn(authStatus?.authStatus || null)
                if (!authStatus?.isLoggedIn) {
                    const newToken = await showAccessTokenInputBox(item.uri)
                    const authStatusFromToken = await this.auth(selectedEndpoint, newToken || null)
                    this.showIsLoggedIn(authStatusFromToken?.authStatus || null)
                }
                debug('AuthProvider:signinMenu', mode, selectedEndpoint)
            }
        }
    }

    private async signinMenuForInstanceUrl(instanceUrl: string): Promise<void> {
        const accessToken = await showAccessTokenInputBox(instanceUrl)
        if (!accessToken) {
            return
        }
        const authState = await this.auth(instanceUrl, accessToken)
        this.telemetryService.log('CodyVSCodeExtension:auth:fromToken', {
            success: Boolean(authState?.isLoggedIn),
        })
    }

    private showIsLoggedIn(authStatus: AuthStatus | null): void {
        if (!authStatus?.isLoggedIn || !authStatus.endpoint) {
            return
        }
        const endpointName = isLocalApp(authStatus.endpoint) ? 'Cody App' : authStatus.endpoint
        void vscode.window.showInformationMessage(`Signed in to ${endpointName}`)
    }

    public async appAuth(uri?: string): Promise<void> {
        debug('AuthProvider:appAuth:init', '')
        const token = await secretStorage.get('SOURCEGRAPH_CODY_APP')
        if (token) {
            const authStatus = await this.auth(LOCAL_APP_URL.href, token)
            if (authStatus?.isLoggedIn) {
                return
            }
        }
        if (!uri) {
            return
        }
        await vscode.env.openExternal(vscode.Uri.parse(uri))
    }

    // Display quickpick to select endpoint to sign out of
    public async signoutMenu(): Promise<void> {
        this.telemetryService.log('CodyVSCodeExtension:logout:clicked')
        const endpointQuickPickItem = this.authStatus.endpoint ? [this.authStatus.endpoint] : []
        const endpoint = await AuthMenu('signout', endpointQuickPickItem)
        if (!endpoint?.uri) {
            return
        }
        await this.signout(endpoint.uri)
        debug('AuthProvider:signoutMenu', endpoint.uri)
    }

    // Log user out of the selected endpoint (remove token from secret)
    private async signout(endpoint: string): Promise<void> {
        // Restart appDetector if endpoint is App
        if (isLocalApp(endpoint)) {
            await this.appDetector.init()
        }
        await secretStorage.deleteToken(endpoint)
        await localStorage.deleteEndpoint()
        await this.auth(endpoint, null)
        this.authStatus.endpoint = ''
        await vscode.commands.executeCommand('setContext', 'cody.activated', false)
    }

    // Create Auth Status
    private async makeAuthStatus(
        config: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'accessToken' | 'customHeaders'>
    ): Promise<AuthStatus> {
        const endpoint = config.serverEndpoint
        const token = config.accessToken
        if (!token || !endpoint) {
            return { ...defaultAuthStatus, endpoint }
        }
        // Cache the config and the GraphQL client
        if (this.config !== config || !this.client) {
            this.config = config
            this.client = new SourcegraphGraphQLAPIClient(config)
        }
        // Version is for frontend to check if Cody is not enabled due to unsupported version when siteHasCodyEnabled is false
        const [{ enabled, version }, codyLLMConfiguration] = await Promise.all([
            this.client.isCodyEnabled(),
            this.client.getCodyLLMConfiguration(),
        ])

        const configOverwrites = !isError(codyLLMConfiguration) ? codyLLMConfiguration : undefined

        const isDotComOrApp = this.client.isDotCom() || isLocalApp(endpoint)
        if (!isDotComOrApp) {
            const currentUserID = await this.client.getCurrentUserId()
            const hasVerifiedEmail = false

            // check first if it's a network error
            if (isError(currentUserID)) {
                if (isNetworkError(currentUserID.message)) {
                    return { ...networkErrorAuthStatus, endpoint }
                }
            }

            return newAuthStatus(
                endpoint,
                isDotComOrApp,
                !isError(currentUserID),
                hasVerifiedEmail,
                enabled,
                version,
                configOverwrites
            )
        }
        const userInfo = await this.client.getCurrentUserIdAndVerifiedEmail()
        const isCodyEnabled = true

        // check first if it's a network error
        if (isError(userInfo)) {
            if (isNetworkError(userInfo.message)) {
                return { ...networkErrorAuthStatus, endpoint }
            }
        }

        return isError(userInfo)
            ? { ...unauthenticatedStatus, endpoint }
            : newAuthStatus(
                  endpoint,
                  isDotComOrApp,
                  !!userInfo.id,
                  userInfo.hasVerifiedEmail,
                  isCodyEnabled,
                  version,
                  configOverwrites
              )
    }

    public getAuthStatus(): AuthStatus {
        return this.authStatus
    }

    // It processes the authentication steps and stores the login info before sharing the auth status with chatview
    public async auth(
        uri: string,
        token: string | null,
        customHeaders?: {} | null
    ): Promise<{ authStatus: AuthStatus; isLoggedIn: boolean } | null> {
        const endpoint = formatURL(uri) || ''
        const config = {
            serverEndpoint: endpoint,
            accessToken: token,
            customHeaders: customHeaders || this.config.customHeaders,
        }
        const authStatus = await this.makeAuthStatus(config)
        const isLoggedIn = isAuthed(authStatus)
        authStatus.isLoggedIn = isLoggedIn
        await this.storeAuthInfo(endpoint, token)
        await this.syncAuthStatus(authStatus)
        await vscode.commands.executeCommand('setContext', 'cody.activated', isLoggedIn)
        return { authStatus, isLoggedIn }
    }

    // Set auth status in case of reload
    public async reloadAuthStatus(): Promise<void> {
        await this.auth(this.config.serverEndpoint, this.config.accessToken, this.config.customHeaders)
    }

    // Set auth status and share it with chatview
    private async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        if (this.authStatus === authStatus) {
            return
        }
        this.authStatus = authStatus
        await this.announceNewAuthStatus()
    }

    public async announceNewAuthStatus(): Promise<void> {
        if (this.authStatus.endpoint === 'init' || !this.webview) {
            return
        }
        await vscode.commands.executeCommand('cody.auth.sync')
    }
    /**
     * Display app state in webview view that is used during Signin flow
     */
    public async syncLocalAppState(type: string): Promise<void> {
        if (this.authStatus.endpoint === 'init' || !this.webview) {
            return
        }
        // Log user into App if user is currently not logged in and has App running
        if (type !== 'app' && !this.authStatus.isLoggedIn) {
            await this.appAuth()
        }
        // Notify webview that app is installed
        await this.webview?.postMessage({ type: 'app-state', isInstalled: true })
    }

    // Register URI Handler (vscode://sourcegraph.cody-ai) for:
    // - Deep linking into VS Code with Cody focused (e.g. from the App setup)
    // - Resolving token sending back from sourcegraph.com and App
    public async tokenCallbackHandler(uri: vscode.Uri, customHeaders: {}): Promise<void> {
        const params = new URLSearchParams(uri.query)
        const isApp = params.get('type') === 'app'
        const token = params.get('code')
        const endpoint = isApp ? LOCAL_APP_URL.href : this.authStatus.endpoint
        if (!token || !endpoint) {
            return
        }
        const authState = await this.auth(endpoint, token, customHeaders)
        this.telemetryService.log('CodyVSCodeExtension:auth:fromCallback', {
            type: 'callback',
            from: isApp ? 'app' : 'web',
            success: Boolean(authState?.isLoggedIn),
        })
        if (authState?.isLoggedIn) {
            const successMessage = isApp ? 'Connected to Cody App' : `Signed in to ${endpoint}`
            await vscode.window.showInformationMessage(successMessage)
        }
    }

    /** Open callback URL in browser to get token from instance. */
    public redirectToEndpointLogin(uri: string): void {
        const endpoint = formatURL(uri)
        if (!endpoint) {
            return
        }

        if (vscode.env.uiKind === vscode.UIKind.Web) {
            // VS Code Web needs a different kind of callback using asExternalUri and changes to our
            // UserSettingsCreateAccessTokenCallbackPage.tsx page in the Sourcegraph web app. So,
            // just require manual token entry for now.
            const newTokenNoCallbackUrl = new URL('/user/settings/tokens/new', endpoint)
            void vscode.env.openExternal(vscode.Uri.parse(newTokenNoCallbackUrl.href))
            void this.signinMenuForInstanceUrl(endpoint)
            return
        }

        const newTokenCallbackUrl = new URL('/user/settings/tokens/new/callback', endpoint)
        newTokenCallbackUrl.searchParams.append(
            'requestFrom',
            this.appScheme === 'vscode-insiders' ? 'CODY_INSIDERS' : 'CODY'
        )
        this.authStatus.endpoint = endpoint
        void vscode.env.openExternal(vscode.Uri.parse(newTokenCallbackUrl.href))
    }

    // Refresh current endpoint history with the one from local storage
    private loadEndpointHistory(): void {
        this.endpointHistory = localStorage.getEndpointHistory() || []
    }

    // Store endpoint in local storage, token in secret storage, and update endpoint history
    private async storeAuthInfo(endpoint: string | null | undefined, token: string | null | undefined): Promise<void> {
        if (!endpoint) {
            return
        }
        await localStorage.saveEndpoint(endpoint)
        if (token) {
            await secretStorage.storeToken(endpoint, token)
        }
        this.loadEndpointHistory()
    }
}

export function isNetworkError(error: string): boolean {
    return (
        error.includes('ENOTFOUND') ||
        error.includes('ECONNREFUSED') ||
        error.includes('ECONNRESET') ||
        error.includes('EHOSTUNREACH')
    )
}

function formatURL(uri: string): string | null {
    if (!uri) {
        return null
    }
    // Check if the URI is in the correct URL format
    // Add missing https:// if needed
    if (!uri.startsWith('http')) {
        uri = `https://${uri}`
    }
    try {
        const endpointUri = new URL(uri)
        return endpointUri.href
    } catch {
        console.error('Invalid URL')
    }
    return null
}
