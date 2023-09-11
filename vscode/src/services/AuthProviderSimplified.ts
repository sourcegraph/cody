import * as vscode from 'vscode'

import { AuthProvider } from './AuthProvider'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

// An auth provider for simplified onboarding. This is a sidecar to AuthProvider
// so we can deprecate the experiment later. AuthProviderSimplified only works
// for dotcom, and doesn't work on VScode web. See LoginSimplified.

export class AuthProviderSimplified {
    public async openExternalAuthUrl(classicAuthProvider: AuthProvider, method: AuthMethod): Promise<void> {
        if (!(await openExternalAuthUrl(method))) {
            return
        }
        classicAuthProvider.authProviderSimplifiedWillAttemptAuth()
    }
}

type AuthMethod = 'dotcom' | 'github' | 'gitlab' | 'google'

// Opens authentication URLs for simplified onboarding.
async function openExternalAuthUrl(provider: AuthMethod): Promise<boolean> {
    // Create the turducken of redirects:
    // 1. Specific login page (GitHub, etc.) redirects to the post-sign up survey
    // 2. Post-sign up survery redirects to the new token page
    // 3. New token page redirects back to the extension with the new token
    const uriScheme = vscode.env.uriScheme
    const isInsiders = uriScheme === 'vscode-insiders'
    const referralCode = isInsiders ? 'CODY_INSIDERS' : 'CODY'
    const newTokenUrl = `/user/settings/tokens/new/callback?requestFrom=${referralCode}`
    const postSignUpSurveyUrl = `/post-sign-up?returnTo=${newTokenUrl}`
    const site = DOTCOM_URL.toString() // Note, ends with the path /

    const genericLoginUrl = `${site}sign-in?returnTo=${postSignUpSurveyUrl}`
    const gitHubLoginUrl = `${site}.auth/github/login?pc=https%3A%2F%2Fgithub.com%2F%3A%3Ae917b2b7fa9040e1edd4&redirect=${
        postSignUpSurveyUrl
    }`
    const gitLabLoginUrl = `${site}.auth/gitlab/login?pc=https%3A%2F%2Fgitlab.com%2F%3A%3Ab45ecb474e92c069567822400cf73db6e39917635bf682f062c57aca68a1e41c&redirect=${
        postSignUpSurveyUrl
    }`
    const googleLoginUrl = `${site}.auth/openidconnect/login?pc=google&redirect=${postSignUpSurveyUrl}`

    let uriSpec
    switch (provider) {
        case 'github':
            uriSpec = gitHubLoginUrl
            break
        case 'gitlab':
            uriSpec = gitLabLoginUrl
            break
        case 'google':
            uriSpec = googleLoginUrl
            break
        case 'dotcom':
        default:
            // This login form has links to other login methods, it is the best
            // catch-all
            uriSpec = genericLoginUrl
            break
    }

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
