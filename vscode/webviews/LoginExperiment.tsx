import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { DOTCOM_URL } from '../src/chat/protocol'

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
    const isInsiders = uriScheme === 'vscode-insiders'
    const referralCode = isInsiders ? 'CODY_INSIDERS' : 'CODY'
    const signInRedirect = uriScheme + '://sourcegraph.cody-ai/code='

    return (
        <div>
            <a
                href={`https://sourcegraph.com/.auth/github/login?pc=https%3A%2F%2Fgithub.com%2F%3A%3Ae917b2b7fa9040e1edd4&redirect=/user/settings/tokens/new/callback%3frequestFrom=${referralCode}`}
            >
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
