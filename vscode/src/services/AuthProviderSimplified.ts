import * as vscode from 'vscode'

import { DOTCOM_URL, getCodyAuthReferralCode } from '@sourcegraph/cody-shared'

import type { AuthMethod } from '../chat/protocol'

import { authProvider } from './AuthProvider'

// An auth provider for simplified onboarding. This is a sidecar to AuthProvider
// so we can deprecate the experiment later. AuthProviderSimplified only works
// for dotcom, and doesn't work on VScode web. See LoginSimplified.

export class AuthProviderSimplified {
    public async openExternalAuthUrl(method: AuthMethod, tokenReceiverUrl?: string): Promise<boolean> {
        if (!(await openExternalAuthUrl(method, tokenReceiverUrl))) {
            return false
        }
        authProvider.setAuthPendingToEndpoint(DOTCOM_URL.toString())
        return true
    }
}

// Opens authentication URLs for simplified onboarding.
function openExternalAuthUrl(provider: AuthMethod, tokenReceiverUrl?: string): Thenable<boolean> {
    // Create the chain of redirects:
    // 1. Specific login page (GitHub, etc.) redirects to the new token page
    // 2. New token page redirects back to the extension with the new token
    const referralCode = getCodyAuthReferralCode(vscode.env.uriScheme)
    const tokenReceiver = tokenReceiverUrl ? `&tokenReceiverUrl=${tokenReceiverUrl}` : ''
    const redirect = encodeURIComponent(
        `/user/settings/tokens/new/callback?requestFrom=${referralCode}${tokenReceiver}`
    )
    const site = DOTCOM_URL.toString()
    const uriSpec =
        provider === 'github' || provider === 'gitlab' || provider === 'google'
            ? `${site}.auth/openidconnect/login?prompt_auth=${provider}&pc=sams&redirect=${redirect}`
            : `${site}sign-in?returnTo=${redirect}`

    // VScode Uri handling escapes ?, = in the redirect parameter. dotcom's
    // redirectTo handling does not unescape these. As a result we route
    // /post-sign-up%3F... as a search. Work around VScode's Uri handling
    // by passing a string which gets passed through to a string|Uri parameter
    // anyway.

    // FIXME: Pass a Uri here when dotcom redirectTo handling applies one level
    // of unescaping to the parameter, or we special case the routing for
    // /post-sign-up%3F...
    return vscode.env.openExternal(uriSpec as unknown as vscode.Uri)
}
