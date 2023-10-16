import { useEffect } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { AuthMethod } from '../src/chat/protocol'

import onboardingSplashImage from './cody-onboarding-splash.svg'
import signInLogoGitHub from './sign-in-logo-github.svg'
import signInLogoGitLab from './sign-in-logo-gitlab.svg'
import signInLogoGoogle from './sign-in-logo-google.svg'
import { VSCodeWrapper } from './utils/VSCodeApi'

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
                    Sign up at sourcegraph.com
                </a>
            </li>
            <li>
                <a href="https://sourcegraph.com/user/settings/tokens" target="site">
                    Generate an Access Token
                </a>
            </li>
            <li>
                <a
                    href="about:blank"
                    onClick={event => {
                        telemetryService.log('CodyVSCodeExtension:auth:clickSignInWeb')
                        vscodeAPI.postMessage({
                            command: 'simplified-onboarding',
                            type: 'web-sign-in-token',
                        })
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                >
                    Add the Access Token to VScode
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
        vscodeAPI.postMessage({ command: 'auth', type: 'signin' })
    }
    useEffect(() => {
        vscodeAPI.postMessage({ command: 'auth', type: 'simplified-onboarding-exposure' })
    }, [vscodeAPI])
    return (
        <div className={styles.container}>
            <div className={styles.sectionsContainer}>
                <img src={onboardingSplashImage} alt="Hi, I'm Cody" className={styles.logo} />
                <div className={classNames(styles.section, styles.authMethodScreen)}>
                    Sign in to get started:
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
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <p className={styles.terms}>
                    By signing in, you agree to our <a href="https://about.sourcegraph.com/terms">Terms of Service</a>{' '}
                    and <a href="https://about.sourcegraph.com/terms/privacy">Privacy Policy</a>
                </p>
            </div>
            <div className={styles.otherSignInOptions}>
                Use Sourcegraph Enterprise?
                <br />
                <button type="button" className={styles.linkButton} onClick={otherSignInClick}>
                    Sign In to Enterprise Instance
                </button>
            </div>
        </div>
    )
}
