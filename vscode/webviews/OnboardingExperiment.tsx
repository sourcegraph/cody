import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { CodyIDE, type TelemetryRecorder } from '@sourcegraph/cody-shared'

import type { AuthMethod } from '../src/chat/protocol'

import onboardingSplashImage from './cody-onboarding-splash.svg'
import signInLogoGitHub from './sign-in-logo-github.svg'
import signInLogoGitLab from './sign-in-logo-gitlab.svg'
import signInLogoGoogle from './sign-in-logo-google.svg'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { useState } from 'react'
import styles from './OnboardingExperiment.module.css'
import { ClientSignInForm } from './components/ClientSignInForm'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './components/shadcn/ui/select'
import { useTelemetryRecorder } from './utils/telemetry'
import { useConfig } from './utils/useConfig'

interface LoginProps {
    simplifiedLoginRedirect: (method: AuthMethod) => void
    uiKindIsWeb: boolean
    vscodeAPI: VSCodeWrapper
    codyIDE: CodyIDE
    endpointHistory?: string[]
}

const WebLogin: React.FunctionComponent<
    React.PropsWithoutRef<{
        isCodyWeb: boolean
        telemetryRecorder: TelemetryRecorder
        vscodeAPI: VSCodeWrapper
    }>
> = ({ vscodeAPI, isCodyWeb }) => {
    const telemetryRecorder = useTelemetryRecorder()
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
            {isCodyWeb && (
                <li>
                    <a
                        href="about:blank"
                        onClick={event => {
                            telemetryRecorder.recordEvent('cody.webview.auth', 'clickSignIn')
                            vscodeAPI.postMessage({
                                command: 'simplified-onboarding',
                                onboardingKind: 'web-sign-in-token',
                            })
                            event.preventDefault()
                            event.stopPropagation()
                        }}
                    >
                        Add Access Token to Cody
                    </a>
                </li>
            )}
        </ol>
    )
}

// A login component which is simplified by not having an app setup flow.
export const LoginSimplified: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    simplifiedLoginRedirect,
    uiKindIsWeb,
    vscodeAPI,
    codyIDE,
    endpointHistory,
}) => {
    const authStatus = useConfig().authStatus
    const telemetryRecorder = useTelemetryRecorder()
    const otherSignInClick = (endpoint?: string): void => {
        vscodeAPI.postMessage({ command: 'auth', authKind: 'signin', endpoint })
    }
    const isNonVSCodeIDE = codyIDE !== CodyIDE.Web && codyIDE !== CodyIDE.VSCode
    const isCodyWebUI = (uiKindIsWeb || codyIDE === CodyIDE.Web) && !isNonVSCodeIDE

    const [selectedEndpoint, setSelectedEndpoint] = useState(endpointHistory?.[0])
    const [onboardingView, setOnboardingView] = useState<boolean>(!selectedEndpoint)

    if (isNonVSCodeIDE && endpointHistory?.length && selectedEndpoint && !onboardingView) {
        return (
            <div className={styles.container}>
                <div className={styles.sectionsContainer}>
                    <img src={onboardingSplashImage} alt="Hi, I'm Cody" className={styles.logo} />
                    <div className={styles.section}>
                        <h1>Select a Sourcegraph Instance</h1>
                        <div className={styles.buttonWidthSizer}>
                            <div className={styles.buttonStack}>
                                <Select onValueChange={v => setSelectedEndpoint(v)} value="">
                                    <SelectTrigger>
                                        <SelectValue placeholder={selectedEndpoint} />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned" className="tw-w-full">
                                        <SelectGroup key="instancesx">
                                            {endpointHistory.map(endpoint => (
                                                <SelectItem
                                                    key={endpoint}
                                                    value={endpoint}
                                                    className="tw-w-full tw-bg-muted"
                                                >
                                                    {endpoint}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <VSCodeButton
                                    className={styles.button}
                                    type="button"
                                    onClick={() => otherSignInClick()}
                                >
                                    Sign In
                                </VSCodeButton>
                            </div>
                        </div>
                    </div>
                    <div className={styles.section}>
                        <h1>Instance not on the list?</h1>
                        <VSCodeButton
                            className={styles.button}
                            type="button"
                            onClick={() => setOnboardingView(true)}
                        >
                            Add New Account
                        </VSCodeButton>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.sectionsContainer}>
                <img src={onboardingSplashImage} alt="Hi, I'm Cody" className={styles.logo} />
                <div className={styles.section}>
                    <h1>Cody Free or Cody Pro</h1>
                    <div className={styles.buttonWidthSizer}>
                        <div className={styles.buttonStack}>
                            {isCodyWebUI ? (
                                <WebLogin
                                    telemetryRecorder={telemetryRecorder}
                                    vscodeAPI={vscodeAPI}
                                    isCodyWeb={isCodyWebUI}
                                />
                            ) : (
                                <>
                                    <VSCodeButton
                                        className={styles.button}
                                        type="button"
                                        onClick={() => {
                                            telemetryRecorder.recordEvent(
                                                'cody.webview.auth',
                                                'simplifiedSignInGitLabClick'
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
                                            telemetryRecorder.recordEvent(
                                                'cody.webview.auth',
                                                'simplifiedSignInGitLabClick'
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
                                            telemetryRecorder.recordEvent(
                                                'cody.webview.auth',
                                                'simplifiedSignInGoogleClick'
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
                    {isCodyWebUI || codyIDE === CodyIDE.VSCode ? (
                        <div className={styles.buttonWidthSizer}>
                            <div className={styles.buttonStack}>
                                <VSCodeButton
                                    className={styles.button}
                                    type="button"
                                    onClick={() => otherSignInClick()}
                                >
                                    Sign In to Your Enterprise&nbsp;Instance
                                </VSCodeButton>
                            </div>
                        </div>
                    ) : (
                        <ClientSignInForm authStatus={authStatus} vscodeAPI={vscodeAPI} />
                    )}
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
