import * as vscode from 'vscode'

import {
    type AuthStatus,
    DOTCOM_URL,
    type PickResolvedConfiguration,
    SourcegraphGraphQLAPIClient,
    cenv,
    clientCapabilities,
    currentAuthStatus,
    getCodyAuthReferralCode,
    graphqlClient,
    isDotCom,
    isError,
    isNetworkLikeError,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { isSourcegraphToken } from '../chat/protocol'
import { newAuthStatus } from '../chat/utils'
import { logDebug } from '../output-channel-logger'
import { authProvider } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'
import { secretStorage } from '../services/SecretStorageProvider'
import { closeAuthProgressIndicator } from './auth-progress-indicator'

interface LoginMenuItem {
    id: string
    label: string
    description: string
    totalSteps: number
    uri: string
}

type AuthMenuType = 'signin' | 'switch'

/**
 * Show a quickpick to select the endpoint to sign into.
 */
export async function showSignInMenu(
    type?: 'enterprise' | 'dotcom' | 'token',
    uri?: string
): Promise<void> {
    const authStatus = currentAuthStatus()
    const mode: AuthMenuType = authStatus.authenticated ? 'switch' : 'signin'
    logDebug('AuthProvider:signinMenu', mode)
    telemetryRecorder.recordEvent('cody.auth.login', 'clicked')
    const item = await showAuthMenu(mode)
    if (!item) {
        return
    }
    const menuID = type || item?.id
    telemetryRecorder.recordEvent('cody.auth.signin.menu', 'clicked', {
        privateMetadata: { menuID },
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    switch (menuID) {
        case 'enterprise': {
            const instanceUrl = await showInstanceURLInputBox(item.uri)
            if (!instanceUrl) {
                return
            }
            authProvider.setAuthPendingToEndpoint(instanceUrl)
            redirectToEndpointLogin(instanceUrl)
            break
        }
        case 'dotcom':
            redirectToEndpointLogin(DOTCOM_URL.href)
            break
        case 'token': {
            const instanceUrl = await showInstanceURLInputBox(uri || item.uri)
            if (!instanceUrl) {
                return
            }
            await signinMenuForInstanceUrl(instanceUrl)
            break
        }
        default: {
            // Auto log user if token for the selected instance was found in secret
            const selectedEndpoint = item.uri
            const token = await secretStorage.getToken(selectedEndpoint)
            const tokenSource = await secretStorage.getTokenSource(selectedEndpoint)
            let { authStatus } = token
                ? await authProvider.validateAndStoreCredentials(
                      { serverEndpoint: selectedEndpoint, accessToken: token, tokenSource },
                      'store-if-valid'
                  )
                : { authStatus: undefined }
            if (!authStatus?.authenticated) {
                const newToken = await showAccessTokenInputBox(selectedEndpoint)
                if (!newToken) {
                    return
                }
                authStatus = (
                    await authProvider.validateAndStoreCredentials(
                        {
                            serverEndpoint: selectedEndpoint,
                            accessToken: newToken,
                            tokenSource: 'paste',
                        },
                        'store-if-valid'
                    )
                ).authStatus
            }
            await showAuthResultMessage(selectedEndpoint, authStatus)
            logDebug('AuthProvider:signinMenu', mode, selectedEndpoint)
        }
    }
}

function getEndpointItemLabel(uri: string, isAuthenticated: boolean): string {
    const icon = isAuthenticated ? '$(check) ' : ''
    return isDotCom(uri) ? `${icon}Sourcegraph.com` : `${icon}${uri}`
}

async function showAuthMenu(type: AuthMenuType): Promise<LoginMenuItem | null> {
    const { endpoint: currentEndpoint } = currentAuthStatus()
    const endpointHistory = localStorage.getEndpointHistory() ?? []

    const historyItems = endpointHistory.reverse().map(uri => ({
        id: uri,
        label: getEndpointItemLabel(uri, currentEndpoint === uri),
        description: '',
        totalSteps: 1,
        uri,
    }))

    const optionItems: vscode.QuickPickItem[] = [
        ...LoginMenuOptionItems,
        { label: 'account history', kind: vscode.QuickPickItemKind.Separator },
        ...historyItems,
    ]

    return vscode.window.showQuickPick(optionItems, AuthMenuOptions[type]) as Promise<LoginMenuItem>
}

/**
 * Show a VS Code input box to ask the user to enter a Sourcegraph instance URL.
 */
async function showInstanceURLInputBox(title: string): Promise<string | undefined> {
    const result = await vscode.window.showInputBox({
        title,
        prompt: 'Enter the URL of the Sourcegraph instance. For example, https://sourcegraph.example.com.',
        placeHolder: 'https://sourcegraph.example.com',
        value: 'https://',
        password: false,
        ignoreFocusOut: true,
        // valide input to ensure the user is not entering a token as URL
        validateInput: (value: string) => {
            // ignore empty value
            if (!value) {
                return null
            }
            if (isSourcegraphToken(value)) {
                return 'Please enter a valid URL'
            }
            if (value.length > 4 && !value.startsWith('http')) {
                return 'URL must start with http or https'
            }
            if (!/([.]|^https?:\/\/)/.test(value)) {
                return 'Please enter a valid URL'
            }
            return null
        },
    })

    if (typeof result === 'string') {
        return result.trim()
    }
    return result
}

/**
 * Show a VS Code input box to ask the user to enter an access token.
 */
async function showAccessTokenInputBox(endpoint: string): Promise<string | undefined> {
    const result = await vscode.window.showInputBox({
        title: endpoint,
        prompt: 'Paste your access token. To create an access token, go to "Settings" and then "Access tokens" on the Sourcegraph instance.',
        placeHolder: 'Access Token',
        password: true,
        ignoreFocusOut: true,
    })

    if (typeof result === 'string') {
        return result.trim()
    }
    return result
}

const AuthMenuOptions: Record<string, vscode.QuickPickOptions> = {
    signin: {
        title: 'Other Sign-in Options',
        placeHolder: 'Choose a sign-in option',
        ignoreFocusOut: true,
    },
    switch: {
        title: 'Switch Account',
        placeHolder: 'Choose an account',
        ignoreFocusOut: true,
    },
}

const LoginMenuOptionItems = [
    {
        id: 'enterprise',
        label: 'Sign In to Sourcegraph Enterprise Instance',
        description: 'v5.1 and above',
        totalSteps: 1,
        picked: true,
    },
    {
        id: 'token',
        label: 'Sign In to Sourcegraph Enterprise Instance with Access Token',
        description: 'v5.0 and above',
        totalSteps: 2,
    },
    {
        id: 'token',
        label: 'Sign In with URL and Access Token',
        totalSteps: 2,
    },
]

async function signinMenuForInstanceUrl(instanceUrl: string): Promise<void> {
    const accessToken = await showAccessTokenInputBox(instanceUrl)
    if (!accessToken) {
        return
    }
    const { authStatus } = await authProvider.validateAndStoreCredentials(
        { serverEndpoint: instanceUrl, accessToken: accessToken, tokenSource: 'paste' },
        'store-if-valid'
    )
    telemetryRecorder.recordEvent('cody.auth.signin.token', 'clicked', {
        metadata: {
            success: authStatus.authenticated ? 1 : 0,
        },
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    await showAuthResultMessage(instanceUrl, authStatus)
}

/** Open callback URL in browser to get token from instance. */
export function redirectToEndpointLogin(uri: string): void {
    const endpoint = formatURL(uri)
    if (!endpoint) {
        return
    }

    if (
        clientCapabilities().isVSCode &&
        (cenv.CODY_OVERRIDE_UI_KIND ?? vscode.env.uiKind) === vscode.UIKind.Web
    ) {
        // VS Code Web needs a different kind of callback using asExternalUri and changes to our
        // UserSettingsCreateAccessTokenCallbackPage.tsx page in the Sourcegraph web app. So,
        // just require manual token entry for now.
        const newTokenNoCallbackUrl = new URL('/user/settings/tokens/new', endpoint)
        void vscode.env.openExternal(vscode.Uri.parse(newTokenNoCallbackUrl.href))
        void signinMenuForInstanceUrl(endpoint)
        return
    }

    const newTokenCallbackUrl = new URL('/user/settings/tokens/new/callback', endpoint)
    newTokenCallbackUrl.searchParams.append(
        'requestFrom',
        getCodyAuthReferralCode(vscode.env.uriScheme) ?? 'Cody'
    )
    authProvider.setAuthPendingToEndpoint(endpoint)
    void vscode.env.openExternal(vscode.Uri.parse(newTokenCallbackUrl.href))
}

async function showAuthResultMessage(
    endpoint: string,
    authStatus: AuthStatus | undefined
): Promise<void> {
    if (authStatus?.authenticated) {
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

/**
 * Register URI Handler (vscode://sourcegraph.cody-ai) for resolving token sending back from
 * sourcegraph.com.
 */
export async function tokenCallbackHandler(uri: vscode.Uri): Promise<void> {
    closeAuthProgressIndicator()

    const params = new URLSearchParams(uri.query)
    const token = params.get('code') || params.get('token')
    const endpoint = currentAuthStatus().endpoint
    if (!token || !endpoint) {
        return
    }

    const { authStatus } = await authProvider.validateAndStoreCredentials(
        { serverEndpoint: endpoint, accessToken: token, tokenSource: 'redirect' },
        'store-if-valid'
    )
    telemetryRecorder.recordEvent('cody.auth.fromCallback.web', 'succeeded', {
        metadata: {
            success: authStatus?.authenticated ? 1 : 0,
        },
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    if (authStatus?.authenticated) {
        await vscode.window.showInformationMessage(`Signed in to ${endpoint}`)
    } else {
        await showAuthFailureMessage(endpoint)
    }
}

export function formatURL(uri: string): string | null {
    try {
        if (!uri) {
            return null
        }

        // Check if the URI is a sourcegraph token
        if (isSourcegraphToken(uri)) {
            throw new Error('Access Token is not a valid URL')
        }

        // Check if the URI is in the correct URL format
        // Add missing https:// if needed
        if (!uri.startsWith('http')) {
            uri = `https://${uri}`
        }

        const endpointUri = new URL(uri)
        return endpointUri.href
    } catch (error) {
        console.error('Invalid URL: ', error)
        return null
    }
}

export async function showSignOutMenu(): Promise<void> {
    telemetryRecorder.recordEvent('cody.auth.logout', 'clicked', {
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    const { endpoint } = currentAuthStatus()

    if (endpoint) {
        await signOut(endpoint)
        logDebug('AuthProvider:signoutMenu', endpoint)
    }
}

/**
 * Log user out of the selected endpoint (remove token from secret).
 */
export async function signOut(endpoint: string): Promise<void> {
    const token = await secretStorage.getToken(endpoint)
    const tokenSource = await secretStorage.getTokenSource(endpoint)
    // Delete the access token from the Sourcegraph instance on signout if it was created
    // through automated redirect. We don't delete manually entered tokens as they may be
    // used for other purposes, such as the Cody CLI etc.
    if (token && tokenSource === 'redirect') {
        await graphqlClient.DeleteAccessToken(token)
    }
    await secretStorage.deleteToken(endpoint)
    await localStorage.deleteEndpoint(endpoint)
    authProvider.refresh()
}

/**
 * The subset of {@link ResolvedConfiguration} that is needed for authentication.
 */
export type ResolvedConfigurationCredentialsOnly = PickResolvedConfiguration<{
    configuration: 'customHeaders'
    auth: true
    clientState: 'anonymousUserID'
}>

/**
 * Validate the auth credentials.
 */
export async function validateCredentials(
    config: ResolvedConfigurationCredentialsOnly,
    signal?: AbortSignal
): Promise<AuthStatus> {
    // An access token is needed except for Cody Web, which uses cookies.
    if (!config.auth.accessToken && !clientCapabilities().isCodyWeb) {
        return { authenticated: false, endpoint: config.auth.serverEndpoint, pendingValidation: false }
    }

    logDebug('auth', `Authenticating to ${config.auth.serverEndpoint}...`)

    // Check if credentials are valid and if Cody is enabled for the credentials and endpoint.
    const client = SourcegraphGraphQLAPIClient.withStaticConfig({
        configuration: {
            customHeaders: config.configuration.customHeaders,
            telemetryLevel: 'off',
        },
        auth: config.auth,
        clientState: config.clientState,
    })

    const userInfo = await client.getCurrentUserInfo(signal)
    signal?.throwIfAborted()

    if (isError(userInfo) && isNetworkLikeError(userInfo)) {
        logDebug(
            'auth',
            `Failed to authenticate to ${config.auth.serverEndpoint} due to likely network error`,
            userInfo.message
        )
        return {
            authenticated: false,
            showNetworkError: true,
            endpoint: config.auth.serverEndpoint,
            pendingValidation: false,
        }
    }
    if (!userInfo || isError(userInfo)) {
        logDebug(
            'auth',
            `Failed to authenticate to ${config.auth.serverEndpoint} due to invalid credentials or other endpoint error`,
            userInfo?.message
        )
        return {
            authenticated: false,
            endpoint: config.auth.serverEndpoint,
            showInvalidAccessTokenError: true,
            pendingValidation: false,
        }
    }

    logDebug('auth', `Authentication succeed to endpoint ${config.auth.serverEndpoint}`)
    return newAuthStatus({
        ...userInfo,
        endpoint: config.auth.serverEndpoint,
        authenticated: true,
        hasVerifiedEmail: false,
    })
}
