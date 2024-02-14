import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import type { TelemetryService } from '@sourcegraph/cody-shared'

import type { AuthMethod } from '../src/chat/protocol'

import onboardingSplashImage from './cody-onboarding-splash.svg'
import signInLogoGitHub from './sign-in-logo-github.svg'
import signInLogoGitLab from './sign-in-logo-gitlab.svg'
import signInLogoGoogle from './sign-in-logo-google.svg'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './OnboardingExperiment.module.css'

interface LoginProps {
    simplifiedLoginRedirect: (method: AuthMethod) => void
    telemetryService: TelemetryService
    uiKindIsWeb: boolean
    vscodeAPI: VSCodeWrapper
}

const WebLogin: React.FunctionComponent<
    React.PropsWithoutRef<{
        telemetryService: TelemetryService
        vscodeAPI: VSCodeWrapper
    }>
> = ({ telemetryService, vscodeAPI }) => {
    return (
        <ol>
            <li>
                <a href="https://sourcegraph.com/sign-up" target="site">
                    Sign Up at Sourcegraph.com
                </a>
            </li>
            <li>
                <a href="https://sourcegraph.com/user/settings/tokens" target="site">
                    Generate an Access Token
                </a>
            </li>
            <li>
                {/* biome-ignore lint/a11y/useValidAnchor: can fix with a lot of CSS but not a priority */}
                <a
                    href="about:blank"
                    onClick={event => {
                        telemetryService.log('CodyVSCodeExtension:auth:clickSignInWeb')
                        vscodeAPI.postMessage({
                            command: 'simplified-onboarding',
                            onboardingKind: 'web-sign-in-token',
                        })
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                >
                    Add the Access Token to VS Code
                </a>
            </li>
        </ol>
    )
}

// A login component which is simplified by not having an app setup flow.
export const LoginSimplified: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    simplifiedLoginRedirect,
    telemetryService,
    uiKindIsWeb,
    vscodeAPI,
}) => {
    const otherSignInClick = (): void => {
        telemetryService.log('CodyVSCodeExtension:auth:clickOtherSignInOptions')
        vscodeAPI.postMessage({ command: 'auth', authKind: 'signin' })
    }
    return (
        <div className={styles.container}>
            <div className={styles.sectionsContainer}>
                <img src={onboardingSplashImage} alt="Hi, I'm Cody" className={styles.logo} />
                <div className={styles.section}>
                    <h1>Cody Free or Cody Pro</h1>
                    <div className={styles.buttonWidthSizer}>
                        <div className={styles.buttonStack}>
                            {uiKindIsWeb ? (
                                <WebLogin telemetryService={telemetryService} vscodeAPI={vscodeAPI} />
                            ) : (
                                <>
                                    <VSCodeButton
                                        className={styles.button}
                                        type="button"
                                        onClick={() => {
                                            telemetryService.log(
                                                'CodyVSCodeExtension:auth:simplifiedSignInGitHubClick'
                                            )
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
                                            telemetryService.log(
                                                'CodyVSCodeExtension:auth:simplifiedSignInGitLabClick'
                                            )
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
                                            telemetryService.log(
                                                'CodyVSCodeExtension:auth:simplifiedSignInGoogleClick'
                                            )
                                            simplifiedLoginRedirect('google')
                                        }}
                                    >
                                        <img src={signInLogoGoogle} alt="Google logo" />
                                        Sign In with Google
                                    </VSCodeButton>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className={styles.section}>
                    <h1>Cody Enterprise</h1>
                    <div className={styles.buttonWidthSizer}>
                        <div className={styles.buttonStack}>
                            <VSCodeButton
                                className={styles.button}
                                type="button"
                                onClick={otherSignInClick}
                            >
                                Sign In to Your Enterprise&nbsp;Instance
                            </VSCodeButton>
                        </div>
                    </div>
                    <p>
                        Learn more about{' '}
                        <a href="https://sourcegraph.com/cloud">Sourcegraph Enterprise</a>
                    </p>
                </div>
            </div>
            <div className={styles.terms}>
                By signing in to Cody you agree to our{' '}
                <a href="https://about.sourcegraph.com/terms">Terms of Service</a> and{' '}
                <a href="https://about.sourcegraph.com/terms/privacy">Privacy Policy</a>
            </div>
        </div>
    )
}
