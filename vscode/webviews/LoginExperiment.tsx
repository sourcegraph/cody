import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import styles from './LoginExperiment.module.css'

export enum LoginExperimentArm {
    Classic,
    Simplified,
}

interface LoginProps {
    onLoginRedirect: (endpoint: string) => void
    telemetryService: TelemetryService
    uriScheme: string
}

// A login component which is simplified by not having an app setup flow.
export const LoginSimplified: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    onLoginRedirect,
    telemetryService,
    uriScheme,
}) => {
    const signInRedirect = uriScheme + '://sourcegraph.cody-ai/code='

    // Create the turducken of redirects:
    // 1. Specific login page (GitLab, GitHub, etc.) redirects to the post-sign up survey
    // 2. Post-sign up survery redirects to the new token page
    // 3. New token page redirects back to the extension with the new token
    //
    // Works w/ sg start dotcom & sourcegraph.test when the survey is done
    // open question if that will survive the login handler
    // TODO: the sign up form needs to also follow this redirect instead of hardcoding it
    // TODO: URL encoding it also seems fine
    // https://sourcegraph.test:3443/post-sign-up?returnTo=/user/settings/tokens/new/callback?requestFrom=CODY
    // Email sign *in* (but maybe we need a "sign up" here?)
    // https://sourcegraph.test:3443/sign-in?showMore=&returnTo=/post-sign-up?returnTo=/user/settings/tokens/new/callback?requestFrom=CODY
    const isInsiders = uriScheme === 'vscode-insiders'
    const referralCode = isInsiders ? 'CODY_INSIDERS' : 'CODY'
    const newTokenUrl = `/user/settings/tokens/new/callback?requestFrom=${referralCode}`
    const postSignUpSurveyUrl = `/post-sign-up?returnTo=${encodeURIComponent(newTokenUrl)}`
    const site = 'https://sourcegraph.test:3443' || DOTCOM_URL.toString()
    const gitHubLoginUrl = `${site}/.auth/github/login?pc=https%3A%2F%2Fgithub.com%2F%3A%3Ae917b2b7fa9040e1edd4&redirect=${encodeURIComponent(
        postSignUpSurveyUrl
    )}`

    return (
        <div>
            <a href={gitHubLoginUrl}>
                <p>{gitHubLoginUrl}</p>
                <VSCodeButton
                    className={styles.button}
                    type="button"
                    onClick={() => {
                        telemetryService.log('CodyVSCodeExtension:auth:simplifiedSignInGitHub')
                        onLoginRedirect(DOTCOM_URL.href)
                    }}
                >
                    Sign In with GitHub
                </VSCodeButton>
            </a>
            <p>
                <a
                    href={`https://sourcegraph.com/.auth/gitlab/login?pc=https%3A%2F%2Fgitlab.com%2F%3A%3A262309265ae76179773477bd50c93c7022007a4810c344c69a7371da11949c48&redirect=/user/settings/tokens/new/callback%3frequestFrom=${referralCode}`}
                >
                    Sign In with Gitlab
                </a>
            </p>
            <p>
                <a href={`https://sourcegraph.com/sign-in?returnTo=${signInRedirect}&showMore=`}>
                    Continue with Email &rarr;
                </a>
            </p>
        </div>
    )
}
