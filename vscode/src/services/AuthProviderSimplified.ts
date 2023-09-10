import * as vscode from 'vscode'

import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { AuthProvider } from './AuthProvider'

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
    // 1. Specific login page (email, GitHub, GitLab) redirects to the post-sign up survey
    // 2. Post-sign up survery redirects to the new token page
    // 3. New token page redirects back to the extension with the new token
    const uriScheme = vscode.env.uriScheme
    const isInsiders = uriScheme === 'vscode-insiders'
    const referralCode = isInsiders ? 'CODY_INSIDERS' : 'CODY'
    const newTokenUrl = `/user/settings/tokens/new/callback?requestFrom=${referralCode}`
    // FIXME: This redirect will not work until https://github.com/sourcegraph/sourcegraph/pull/56360
    const postSignUpSurveyUrl = `/post-sign-up?returnTo=${newTokenUrl}`
    // DONOTCOMMIT
    const site = /* 'https://sourcegraph.test:3443/' || */ DOTCOM_URL.toString()

    const emailLoginUrl = `${site}sign-in?showMore=&returnTo=${postSignUpSurveyUrl}`
    const gitHubLoginUrl = `${site}.auth/github/login?pc=https%3A%2F%2Fgithub.com%2F%3A%3Ae917b2b7fa9040e1edd4&redirect=${
        postSignUpSurveyUrl
    }`
    const gitLabLoginUrl = `${site}.auth/gitlab/login?pc=https%3A%2F%2Fgitlab.com%2F%3A%3A262309265ae76179773477bd50c93c7022007a4810c344c69a7371da11949c48&redirect=${
        postSignUpSurveyUrl
    }`
    const googleLoginUrl = `${site}.auth/openidconnect/login?pc=google&redirect=${postSignUpSurveyUrl}`

    let uri
    switch (provider) {
        case 'github':
            uri = gitHubLoginUrl
            break
        case 'gitlab':
            uri = gitLabLoginUrl
            break
        case 'google':
            uri = googleLoginUrl
            break
        case 'dotcom':
        default:
            // This login form has a link back to other login methods, it is
            // the best catch-all
            uri = emailLoginUrl
            break
    }

    return vscode.env.openExternal(vscode.Uri.parse(uri))
}
