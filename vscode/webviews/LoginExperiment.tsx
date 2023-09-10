import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import styles from './LoginExperiment.module.css'

import onboardingSplashImage from './cody-onboarding-splash.svg'
import signInLogoGitHub from './sign-in-logo-github.svg'
import signInLogoGitLab from './sign-in-logo-gitlab.svg'
import signInLogoGoogle from './sign-in-logo-google.svg'
import classNames from 'classnames'
import { VSCodeWrapper } from './utils/VSCodeApi'

export enum LoginExperimentArm {
    Classic,
    Simplified,
}

export type AuthMethod = 'dotcom' | 'github' | 'gitlab' | 'google'

interface LoginProps {
    simplifiedLoginRedirect: (method: AuthMethod) => void
    telemetryService: TelemetryService
    vscodeAPI: VSCodeWrapper
}

// A login component which is simplified by not having an app setup flow.
export const LoginSimplified: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    simplifiedLoginRedirect,
    telemetryService,
    vscodeAPI,
}) => {
    const otherSignInClick = (): void => {
        telemetryService.log('CodyVSCodeExtension:auth:clickOtherSignInOptions')
        vscodeAPI.postMessage({ command: 'auth', type: 'signin' })
    }
    return <div className={styles.container}>
        <div className={styles.sectionsContainer}>
        <img src={onboardingSplashImage} alt="Hi, I'm Cody" className={styles.logo} />
        <div className={classNames(styles.section, styles.authMethodScreen)}>
            Sign in to get started:
            <div className={styles.buttonWidthSizer}>
                <div className={styles.buttonStack}>
                    <VSCodeButton
                        className={styles.button}
                        type="button"
                        onClick={() => {
                            telemetryService.log('CodyVSCodeExtension:auth:simplifiedSignInGitHubClick')
                            simplifiedLoginRedirect('github')
                        }}
                    >
                        <img src={signInLogoGitHub} alt="GitHub logo" />
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
                        <img src={signInLogoGitLab} alt="GitLab logo" />
                        Sign In with GitLab
                    </VSCodeButton>
                    <VSCodeButton
                        className={styles.button}
                        type="button"
                        onClick={() => {
                            telemetryService.log('CodyVSCodeExtension:auth:simplifiedSignInGoogleClick')
                            simplifiedLoginRedirect('google')
                        }}
                    >
                        <img src={signInLogoGoogle} alt="Google logo" />
                        Sign In with Google
                    </VSCodeButton>
                </div>
            </div>
        </div>
        <p className={styles.terms}>
            By signing in you&rsquo;re agreeing to Sourcegraph&rsquo;s <a href="https://about.sourcegraph.com/terms/cody-notice">Cody Usage &amp; Privacy Notice</a>
        </p>
    </div>
    <div className={styles.otherSignInOptions}>
            Use Sourcegraph Enterprise?
            <br/>
            <a onClick={otherSignInClick}>
                Sign In to Enterprise Instance
            </a>
    </div>
</div>
}
