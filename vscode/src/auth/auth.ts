import * as vscode from 'vscode'

import {
    type AuthStatus,
    CodyIDE,
    DOTCOM_URL,
    currentAuthStatus,
    getCodyAuthReferralCode,
    isDotCom,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { isSourcegraphToken } from '../chat/protocol'
import { logDebug } from '../log'
import { authProvider } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'
import { secretStorage } from '../services/SecretStorageProvider'
import { closeAuthProgressIndicator } from './auth-progress-indicator'

/**
 * Show a quickpick to select the endpoint to sign into.
 */
export async function showSignInMenu(
    type?: 'enterprise' | 'dotcom' | 'token',
    uri?: string,
    agentIDE: CodyIDE = CodyIDE.VSCode
): Promise<void> {
    const authStatus = currentAuthStatus()
    const mode = authStatus.authenticated ? 'switch' : 'signin'
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
            redirectToEndpointLogin(instanceUrl, agentIDE)
            break
        }
        case 'dotcom':
            redirectToEndpointLogin(DOTCOM_URL.href, agentIDE)
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
            const token = await secretStorage.get(selectedEndpoint)
            let authStatus = token
                ? await authProvider.auth({
                      endpoint: selectedEndpoint,
                      token,
                  })
                : undefined
            if (!authStatus?.authenticated) {
                const newToken = await showAccessTokenInputBox(item.uri)
                if (!newToken) {
                    return
                }
                authStatus = await authProvider.auth({
                    endpoint: selectedEndpoint,
                    token: newToken,
                })
            }
            await showAuthResultMessage(selectedEndpoint, authStatus)
            logDebug('AuthProvider:signinMenu', mode, selectedEndpoint)
        }
    }
}

interface LoginMenuItem {
    id: string
    label: string
    description: string
    totalSteps: number
    uri: string
}

type AuthMenuType = 'signin' | 'switch'

function getItemLabel(uri: string, current: boolean): string {
    const icon = current ? '$(check) ' : ''
    if (isDotCom(uri)) {
        return `${icon}Sourcegraph.com`
    }
    return `${icon}${uri}`
}

async function showAuthMenu(type: AuthMenuType): Promise<LoginMenuItem | null> {
    const endpointHistory = localStorage.getEndpointHistory() ?? []

    // Create option items
    const historySize = endpointHistory?.length
    const history =
        historySize > 0
            ? endpointHistory
                  ?.map((uri, i) => ({
                      id: uri,
                      label: getItemLabel(uri, type === 'switch' && i === historySize - 1),
                      description: '',
                      uri,
                  }))
                  .reverse()
            : []
    const separator = [{ label: type === 'signin' ? 'previously used' : 'current', kind: -1 }]
    const optionItems = [...LoginMenuOptionItems, ...separator, ...history]
    const option = (await vscode.window.showQuickPick(
        optionItems,
        AuthMenuOptions[type]
    )) as LoginMenuItem
    return option
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

const AuthMenuOptions = {
    signin: {
        title: 'Other Sign-in Options',
        placeholder: 'Choose a sign-in option',
    },
    switch: {
        title: 'Switch Account',
        placeHolder: 'Choose an account',
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
    const authState = await authProvider.auth({
        endpoint: instanceUrl,
        token: accessToken,
    })
    telemetryRecorder.recordEvent('cody.auth.signin.token', 'clicked', {
        metadata: {
            success: authState.authenticated ? 1 : 0,
        },
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    await showAuthResultMessage(instanceUrl, authState)
}

/** Open callback URL in browser to get token from instance. */
export function redirectToEndpointLogin(uri: string, agentIDE: CodyIDE = CodyIDE.VSCode): void {
    const endpoint = formatURL(uri)
    if (!endpoint) {
        return
    }

    if (agentIDE === CodyIDE.VSCode && vscode.env.uiKind === vscode.UIKind.Web) {
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
        getCodyAuthReferralCode(agentIDE, vscode.env.uriScheme) ?? 'Cody'
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
export async function tokenCallbackHandler(
    uri: vscode.Uri,
    customHeaders: Record<string, string> | undefined
): Promise<void> {
    closeAuthProgressIndicator()

    const params = new URLSearchParams(uri.query)
    const token = params.get('code') || params.get('token')
    const endpoint = currentAuthStatus().endpoint
    if (!token || !endpoint) {
        return
    }
    const authState = await authProvider.auth({ endpoint, token, customHeaders })
    telemetryRecorder.recordEvent('cody.auth.fromCallback.web', 'succeeded', {
        metadata: {
            success: authState?.authenticated ? 1 : 0,
        },
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    if (authState?.authenticated) {
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
async function signOut(endpoint: string): Promise<void> {
    await secretStorage.deleteToken(endpoint)
    await localStorage.deleteEndpoint()
    await authProvider.auth({ endpoint, token: null })
    await vscode.commands.executeCommand('setContext', 'cody.activated', false)
}
