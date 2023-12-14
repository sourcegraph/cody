import * as vscode from 'vscode'

import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { DOTCOM_URL, isDotCom, LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { CodyChatPanelViewType } from '../chat/chat-view/ChatManager'
import {
    ACCOUNT_USAGE_URL,
    AuthStatus,
    defaultAuthStatus,
    isLoggedIn as isAuthed,
    networkErrorAuthStatus,
    unauthenticatedStatus,
} from '../chat/protocol'
import { newAuthStatus } from '../chat/utils'
import { getFullConfig } from '../configuration'
import { logDebug } from '../log'

import { AuthMenu, showAccessTokenInputBox, showInstanceURLInputBox } from './AuthMenus'
import { localStorage } from './LocalStorageProvider'
import { secretStorage } from './SecretStorageProvider'
import { telemetryService } from './telemetry'
import { telemetryRecorder } from './telemetry-v2'

type Listener = (authStatus: AuthStatus) => void
type Unsubscribe = () => {}

export class AuthProvider {
    private endpointHistory: string[] = []

    private appScheme = vscode.env.uriScheme
    private client: SourcegraphGraphQLAPIClient | null = null

    private authStatus: AuthStatus = defaultAuthStatus
    private listeners: Set<Listener> = new Set()

    constructor(
        private config: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'accessToken' | 'customHeaders'>
    ) {
        this.authStatus.endpoint = 'init'
        this.loadEndpointHistory()
    }

    // Sign into the last endpoint the user was signed into, if any
    public async init(): Promise<void> {
        let lastEndpoint = localStorage?.getEndpoint() || this.config.serverEndpoint
        let token = (await secretStorage.get(lastEndpoint || '')) || this.config.accessToken
        if (lastEndpoint === LOCAL_APP_URL.toString()) {
            // If the user last signed in to app, which talks to dotcom, try
            // signing them in to dotcom.
            logDebug('AuthProvider:init', 'redirecting App-signed in user to dotcom')
            lastEndpoint = DOTCOM_URL.toString()
            token = (await secretStorage.get(lastEndpoint)) || null
        }
        logDebug('AuthProvider:init:lastEndpoint', lastEndpoint)
        await this.auth(lastEndpoint, token || null)
    }

    public addChangeListener(listener: Listener): Unsubscribe {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    // Display quickpick to select endpoint to sign in to
    public async signinMenu(type?: 'enterprise' | 'dotcom' | 'token', uri?: string): Promise<void> {
        const mode = this.authStatus.isLoggedIn ? 'switch' : 'signin'
        logDebug('AuthProvider:signinMenu', mode)
        telemetryService.log('CodyVSCodeExtension:login:clicked', { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.auth.login', 'clicked')
        const item = await AuthMenu(mode, this.endpointHistory)
        if (!item) {
            return
        }
        const menuID = type || item?.id
        telemetryService.log('CodyVSCodeExtension:auth:selectSigninMenu', { menuID, hasV2Event: true })
        telemetryRecorder.recordEvent('cody.auth.signin.menu', 'clicked', {
            privateMetadata: { menuID },
        })
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
            default: {
                // Auto log user if token for the selected instance was found in secret
                const selectedEndpoint = item.uri
                const token = await secretStorage.get(selectedEndpoint)
                let authStatus = await this.auth(selectedEndpoint, token || null)
                if (!authStatus?.isLoggedIn) {
                    const newToken = await showAccessTokenInputBox(item.uri)
                    if (!newToken) {
                        return
                    }
                    authStatus = await this.auth(selectedEndpoint, newToken || null)
                }
                await showAuthResultMessage(selectedEndpoint, authStatus?.authStatus)
                logDebug('AuthProvider:signinMenu', mode, selectedEndpoint)
            }
        }
    }

    private async signinMenuForInstanceUrl(instanceUrl: string): Promise<void> {
        const accessToken = await showAccessTokenInputBox(instanceUrl)
        if (!accessToken) {
            return
        }
        const authState = await this.auth(instanceUrl, accessToken)
        telemetryService.log('CodyVSCodeExtension:auth:fromToken', {
            success: Boolean(authState?.isLoggedIn),
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.auth.signin.token', 'clicked', {
            metadata: {
                success: authState?.isLoggedIn ? 1 : 0,
            },
        })
        await showAuthResultMessage(instanceUrl, authState?.authStatus)
    }

    public async signoutMenu(): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:logout:clicked', { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.auth.logout', 'clicked')
        const { endpoint } = this.authStatus

        if (endpoint) {
            await this.signout(endpoint)
            logDebug('AuthProvider:signoutMenu', endpoint)
        }
    }

    public async accountMenu(): Promise<void> {
        if (!this.authStatus.authenticated || !this.authStatus.endpoint) {
            return
        }

        if (!isDotCom(this.authStatus.endpoint)) {
            const option = await vscode.window.showInformationMessage(
                `Signed in as ${this.authStatus.primaryEmail}`,
                {
                    modal: true,
                    detail: `Enterprise Instance:\n${this.authStatus.endpoint}`,
                },
                'Switch Account...',
                'Sign Out'
            )
            switch (option) {
                case 'Switch Account...':
                    await this.signinMenu()
                    break
                case 'Sign Out':
                    await this.signoutMenu()
                    break
            }
            return
        }

        const codyProEnabled = await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyPro)
        const detail = codyProEnabled ? `Plan: ${this.authStatus.userCanUpgrade ? 'Cody Free' : 'Cody Pro'}` : undefined
        const options = codyProEnabled
            ? ['Manage Account', 'Switch Account...', 'Sign Out']
            : ['Switch Account...', 'Sign Out']
        const option = await vscode.window.showInformationMessage(
            `Signed in as ${
                this.authStatus.displayName
                    ? `${this.authStatus.displayName} (${this.authStatus.primaryEmail})`
                    : this.authStatus.primaryEmail
            }`,
            { modal: true, detail },
            ...options
        )
        switch (option) {
            case 'Manage Account':
                void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_USAGE_URL.toString()))
                break
            case 'Switch Account...':
                await this.signinMenu()
                break
            case 'Sign Out':
                await this.signoutMenu()
                break
        }
    }

    // Log user out of the selected endpoint (remove token from secret)
    private async signout(endpoint: string): Promise<void> {
        await secretStorage.deleteToken(endpoint)
        await localStorage.deleteEndpoint()
        await this.auth(endpoint, null)
        this.authStatus.endpoint = ''
        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, false)
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

        const configOverwrites = isError(codyLLMConfiguration) ? undefined : codyLLMConfiguration

        const isDotCom = this.client.isDotCom()

        if (!isDotCom) {
            const userInfo = await this.client.getEnterpriseCurrentUserInfo()
            const hasVerifiedEmail = false

            // check first if it's a network error
            if (isError(userInfo)) {
                if (isNetworkError(userInfo)) {
                    return { ...networkErrorAuthStatus, endpoint }
                }
                return { ...unauthenticatedStatus, endpoint }
            }

            return newAuthStatus(
                endpoint,
                isDotCom,
                !isError(userInfo),
                hasVerifiedEmail,
                enabled,
                /* userCanUpgrade: */ false,
                version,
                userInfo.avatarURL,
                userInfo.primaryEmail.email,
                userInfo.displayName,
                configOverwrites
            )
        }

        const userInfo = await this.client.getDotComCurrentUserInfo()
        const isCodyEnabled = true

        // check first if it's a network error
        if (isError(userInfo)) {
            if (isNetworkError(userInfo)) {
                return { ...networkErrorAuthStatus, endpoint }
            }
            return { ...unauthenticatedStatus, endpoint }
        }

        const userCanUpgrade =
            isDotCom &&
            'codyProEnabled' in userInfo &&
            typeof userInfo.codyProEnabled === 'boolean' &&
            !userInfo.codyProEnabled

        return newAuthStatus(
            endpoint,
            isDotCom,
            !!userInfo.id,
            userInfo.hasVerifiedEmail,
            isCodyEnabled,
            userCanUpgrade,
            version,
            userInfo.avatarURL,
            userInfo.primaryEmail.email,
            userInfo.displayName,
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
        this.syncAuthStatus(authStatus)
        await vscode.commands.executeCommand('setContext', 'cody.activated', isLoggedIn)
        return { authStatus, isLoggedIn }
    }

    // Set auth status in case of reload
    public async reloadAuthStatus(): Promise<void> {
        this.config = await getFullConfig()
        await this.auth(this.config.serverEndpoint, this.config.accessToken, this.config.customHeaders)
    }

    // Set auth status and share it with chatview
    private syncAuthStatus(authStatus: AuthStatus): void {
        if (this.authStatus === authStatus) {
            return
        }
        this.authStatus = authStatus
        this.announceNewAuthStatus()
    }

    public announceNewAuthStatus(): void {
        if (this.authStatus.endpoint === 'init') {
            return
        }
        const authStatus = this.getAuthStatus()
        for (const listener of this.listeners) {
            listener(authStatus)
        }
    }

    // Register URI Handler (vscode://sourcegraph.cody-ai) for resolving token
    // sending back from sourcegraph.com
    public async tokenCallbackHandler(uri: vscode.Uri, customHeaders: {}): Promise<void> {
        const params = new URLSearchParams(uri.query)
        const token = params.get('code')
        const endpoint = this.authStatus.endpoint
        if (!token || !endpoint) {
            return
        }
        const authState = await this.auth(endpoint, token, customHeaders)
        telemetryService.log('CodyVSCodeExtension:auth:fromCallback', {
            type: 'callback',
            from: 'web',
            success: Boolean(authState?.isLoggedIn),
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.auth.fromCallback.web', 'succeeded', {
            metadata: {
                success: authState?.isLoggedIn ? 1 : 0,
            },
        })
        if (authState?.isLoggedIn) {
            await vscode.window.showInformationMessage(`Signed in to ${endpoint}`)
        } else {
            await showAuthFailureMessage(endpoint)
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

    // Notifies the AuthProvider that the simplified onboarding experiment is
    // kicking off an authorization flow. That flow ends when (if) this
    // AuthProvider gets a call to tokenCallbackHandler.
    public authProviderSimplifiedWillAttemptAuth(): void {
        // FIXME: This is equivalent to what redirectToEndpointLogin does. But
        // the existing design is weak--it mixes other authStatus with this
        // endpoint and races with everything else this class does.

        // Simplified onboarding only supports dotcom.
        this.authStatus.endpoint = DOTCOM_URL.toString()
    }
}

export function isNetworkError(error: Error): boolean {
    const message = error.message
    return (
        message.includes('ENOTFOUND') ||
        message.includes('ECONNREFUSED') ||
        message.includes('ECONNRESET') ||
        message.includes('EHOSTUNREACH')
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

async function showAuthResultMessage(endpoint: string, authStatus: AuthStatus | undefined): Promise<void> {
    if (authStatus?.isLoggedIn) {
        const authority = vscode.Uri.parse(endpoint).authority
        await vscode.window.showInformationMessage(`Signed in to ${authority || endpoint}`)
    } else {
        await showAuthFailureMessage(endpoint)
    }
}

async function showAuthFailureMessage(endpoint: string): Promise<void> {
    const authority = vscode.Uri.parse(endpoint).authority
    await vscode.window.showErrorMessage(
        `Authentication failed. Please ensure Cody is enabled for ${authority} and verify your email address if required.`
    )
}
