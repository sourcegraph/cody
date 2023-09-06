import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import styles from './LoginExperiment.module.css'

export enum LoginExperimentArm {
    Classic,
    Simplified,
}

interface LoginProps {
    simplifiedLoginRedirect: (method: 'dotcom' | 'github' | 'gitlab') => void
    telemetryService: TelemetryService
}

// A login component which is simplified by not having an app setup flow.
export const LoginSimplified: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    simplifiedLoginRedirect,
    telemetryService,
}) => (
    <div>
        <img />
        <h1>Cody</h1>
        <p>Understand and write code faster with an AI assistant</p>
        <div>
            <p>To get started, sign in or continue with email:</p>
            <VSCodeButton
                className={styles.button}
                type="button"
                onClick={() => {
                    telemetryService.log('CodyVSCodeExtension:auth:simplifiedSignInGitHubClick')
                    simplifiedLoginRedirect('github')
                }}
            >
                <img />
                Sign In with GitHub
            </VSCodeButton>
            <VSCodeButton
                className={styles.button}
                type="button"
                onClick={() => {
                    telemetryService.log('CodyVSCodeExtension:auth:simplifiedSignInGitLabClick')
                    simplifiedLoginRedirect('gitlab')
                }}
            >
                <img />
                Sign In with GitLab
            </VSCodeButton>
            <VSCodeButton
                className={styles.link}
                type="button"
                onClick={() => {
                    telemetryService.log('CodyVSCodeExtension:auth:simplifiedSignInEmailClick')
                    simplifiedLoginRedirect('dotcom')
                }}
            >
                Continue with Email &rarr;
            </VSCodeButton>
            <a href="https://sourcegraph.com/sign-up">Sign Up</a>
            <a href="https://about.sourcegraph.com/terms/cody-notice">Terms of Use</a>
        </div>

        <div>
            Use Sourcegraph Enterprise?
            <a href="#">Sign In to Enterprise Instance</a>
        </div>
</div>
)
