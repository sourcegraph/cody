import { useEffect } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { DOTCOM_URL, LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { AuthStatus, isOsSupportedByApp } from '../src/chat/protocol'

import { ConnectApp } from './ConnectApp'
import { ErrorContainer } from './Error'
import { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './Login.module.css'

interface LoginProps {
    authStatus?: AuthStatus
    endpoint: string | null
    isAppInstalled: boolean
    isAppRunning?: boolean
    vscodeAPI: VSCodeWrapper
    telemetryService: TelemetryService
    callbackScheme?: string
    appOS?: string
    appArch?: string
    uiKindIsWeb?: boolean
    onLoginRedirect: (uri: string) => void
}

const APP_DESC = {
    getStarted: (
        <>
            You can now use Cody with your own private code using the{' '}
            <a href="https://docs.sourcegraph.com/app">Cody desktop app</a>. Cody App allows you to index up to 10 local
            repositories, and lets you start Cody chats from anywhere.
        </>
    ),
    connectApp: 'Cody App detected. All that’s left to do is connect VS Code with Cody App.',
    notRunning:
        'It appears that Cody App is installed, but not running. Open Cody App to connect VS Code with Cody App.',
    comingSoon:
        'We’re working on bringing Cody App to your platform. In the meantime, you can try Cody with open source repositories by signing in to Sourcegraph.com.',
}

export const Login: React.FunctionComponent<React.PropsWithChildren<LoginProps>> = ({
    authStatus,
    endpoint,
    vscodeAPI,
    telemetryService,
    callbackScheme,
    appOS,
    appArch,
    uiKindIsWeb,
    isAppInstalled = false,
    isAppRunning = false,
    onLoginRedirect,
}) => {
    useEffect(() => {
        // Log that the user was exposed to the control arm of the simplified
        // onboarding experiment.
        vscodeAPI.postMessage({ command: 'auth', type: 'simplified-onboarding-exposure' })
    }, [vscodeAPI])

    const isOSSupported = isOsSupportedByApp(appOS, appArch)

    const title = isAppInstalled ? (isAppRunning ? 'Connect with Cody App' : 'Cody App Not Running') : 'Get Started'
    const openMsg = isAppInstalled ? (isAppRunning ? APP_DESC.connectApp : APP_DESC.notRunning) : APP_DESC.getStarted

    const AppConnect: React.FunctionComponent = () => (
        <section className={classNames(styles.section, isOSSupported ? styles.codyGradient : styles.greyGradient)}>
            <h2 className={styles.sectionHeader}>{isAppInstalled ? title : 'Download Cody App'}</h2>
            <p className={styles.openMessage}>{openMsg}</p>
            <ConnectApp
                isAppInstalled={isAppInstalled}
                vscodeAPI={vscodeAPI}
                telemetryService={telemetryService}
                isOSSupported={isOSSupported}
                appOS={appOS}
                appArch={appArch}
                isAppRunning={isAppRunning}
                callbackScheme={callbackScheme}
            />
            {!isOSSupported && (
                <small>
                    Sorry, {appOS} {appArch} is not yet supported.
                </small>
            )}
        </section>
    )

    const NoAppConnect: React.FunctionComponent = () => (
        <section className={classNames(styles.section, styles.codyGradient)}>
            {!uiKindIsWeb && (
                <>
                    <h2 className={styles.sectionHeader}>Cody App for {appOS} coming soon</h2>
                    <p className={styles.openMessage}>{APP_DESC.comingSoon}</p>
                </>
            )}
            <VSCodeButton
                className={styles.button}
                type="button"
                onClick={() => {
                    telemetryService.log('CodyVSCodeExtension:auth:clickSignInWithDotcom')
                    onLoginRedirect(DOTCOM_URL.href)
                }}
            >
                Sign in with Sourcegraph.com
            </VSCodeButton>
        </section>
    )

    const isApp = {
        isInstalled: endpoint === LOCAL_APP_URL.href && isAppInstalled,
        isRunning: isAppRunning,
    }

    return (
        <div className={styles.container}>
            {authStatus && <ErrorContainer authStatus={authStatus} isApp={isApp} endpoint={endpoint} />}
            {/* Signin Sections */}
            <div className={styles.sectionsContainer}>
                {!uiKindIsWeb && <AppConnect />}
                {!isOSSupported && <NoAppConnect />}
                <div className={styles.otherSignInOptions}>
                    <VSCodeButton
                        className={styles.button}
                        type="button"
                        onClick={() => {
                            telemetryService.log('CodyVSCodeExtension:auth:clickOtherSignInOptions')
                            vscodeAPI.postMessage({ command: 'auth', type: 'signin' })
                        }}
                    >
                        Other Sign In Options…
                    </VSCodeButton>
                </div>
            </div>
            {/* Footer */}
            <footer className={styles.footer}>
                <VSCodeButton
                    className={styles.button}
                    type="button"
                    onClick={() => {
                        telemetryService.log('CodyVSCodeExtension:auth:clickFeedbackAndSupport')
                        vscodeAPI.postMessage({ command: 'auth', type: 'support' })
                    }}
                >
                    Feedback & Support
                </VSCodeButton>
            </footer>
        </div>
    )
}
