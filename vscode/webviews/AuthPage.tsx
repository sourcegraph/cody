import { type AuthStatus, CodyIDE, type TelemetryRecorder } from '@sourcegraph/cody-shared'

import { type AuthMethod, isSourcegraphToken } from '../src/chat/protocol'

import onboardingSplashImage from './cody-onboarding-splash.svg'
import signInLogoGitHub from './sign-in-logo-github.svg'
import signInLogoGitLab from './sign-in-logo-gitlab.svg'
import signInLogoGoogle from './sign-in-logo-google.svg'
import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'

import { GlobeIcon, LockKeyholeIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from './components/shadcn/ui/button'
import { Form, FormControl, FormField, FormLabel, FormMessage } from './components/shadcn/ui/form'
import { useTelemetryRecorder } from './utils/telemetry'
import { useConfig } from './utils/useConfig'

/**
 * A component that shows the available ways for the user to sign in or sign up.
 */
export const AuthPage: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    simplifiedLoginRedirect,
    uiKindIsWeb,
    vscodeAPI,
    codyIDE,
}) => {
    const authStatus = useConfig().authStatus
    const telemetryRecorder = useTelemetryRecorder()
    const otherSignInClick = (): void => {
        vscodeAPI.postMessage({ command: 'auth', authKind: 'signin' })
    }
    const isNonVSCodeIDE = codyIDE !== CodyIDE.Web && codyIDE !== CodyIDE.VSCode
    const isCodyWebUI = (uiKindIsWeb || codyIDE === CodyIDE.Web) && !isNonVSCodeIDE
    return (
        <div className="tw-flex tw-flex-col tw-items-center tw-gap-8 tw-h-full tw-py-10 tw-px-8">
            <div className="tw-w-full tw-max-w-md tw-flex tw-justify-center">
                <img src={onboardingSplashImage} alt="Hi, I'm Cody" className="tw-my-4" />
            </div>
            <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-border tw-border-border tw-rounded-lg tw-p-6 tw-w-full tw-max-w-md">
                <h2 className="tw-font-semibold tw-text-lg tw-mb-4">Cody Enterprise</h2>
                {isCodyWebUI || codyIDE === CodyIDE.VSCode ? (
                    <div className="tw-flex tw-flex-col tw-gap-6 tw-w-full">
                        <Button onClick={otherSignInClick}>Sign In to Your Enterprise Instance</Button>
                    </div>
                ) : (
                    <ClientSignInForm authStatus={authStatus} vscodeAPI={vscodeAPI} />
                )}
                <p className="tw-mt-4 tw-mb-0 tw-text-muted-foreground">
                    Learn more about <a href="https://sourcegraph.com/cloud">Sourcegraph Enterprise</a>.
                </p>
            </section>
            <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-border tw-border-border tw-rounded-lg tw-p-6 tw-w-full tw-max-w-md">
                <h2 className="tw-font-semibold tw-text-lg tw-mb-4">Cody Free or Cody Pro</h2>
                <div className="tw-flex tw-flex-col tw-gap-6 tw-w-full">
                    {isCodyWebUI ? (
                        <WebLogin
                            telemetryRecorder={telemetryRecorder}
                            vscodeAPI={vscodeAPI}
                            isCodyWeb={isCodyWebUI}
                        />
                    ) : (
                        <>
                            <Button
                                variant="default"
                                onClick={() => {
                                    telemetryRecorder.recordEvent(
                                        'cody.webview.auth',
                                        'simplifiedSignInGitLabClick'
                                    )
                                    simplifiedLoginRedirect('github')
                                }}
                            >
                                <img src={signInLogoGitHub} alt="GitHub logo" className="tw-w-[16px]" />
                                Sign In with GitHub
                            </Button>
                            <Button
                                onClick={() => {
                                    telemetryRecorder.recordEvent(
                                        'cody.webview.auth',
                                        'simplifiedSignInGitLabClick'
                                    )
                                    simplifiedLoginRedirect('gitlab')
                                }}
                            >
                                <img src={signInLogoGitLab} alt="GitLab logo" className="tw-w-[16px]" />
                                Sign In with GitLab
                            </Button>
                            <Button
                                onClick={() => {
                                    telemetryRecorder.recordEvent(
                                        'cody.webview.auth',
                                        'simplifiedSignInGoogleClick'
                                    )
                                    simplifiedLoginRedirect('google')
                                }}
                            >
                                <img src={signInLogoGoogle} alt="Google logo" className="tw-w-[16px]" />
                                Sign In with Google
                            </Button>
                        </>
                    )}
                </div>
            </section>
            <footer className="tw-text-sm tw-text-muted-foreground">
                Cody is proudly built by Sourcegraph. By signing in to Cody, you agree to our{' '}
                <a target="_blank" rel="noopener noreferrer" href="https://about.sourcegraph.com/terms">
                    Terms of Service
                </a>{' '}
                and{' '}
                <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://about.sourcegraph.com/terms/privacy"
                >
                    Privacy Policy
                </a>
                .
            </footer>
        </div>
    )
}

interface LoginProps {
    simplifiedLoginRedirect: (method: AuthMethod) => void
    uiKindIsWeb: boolean
    vscodeAPI: VSCodeWrapper
    codyIDE: CodyIDE
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

interface ClientSignInFormProps {
    vscodeAPI: VSCodeWrapper
    authStatus?: AuthStatus
    className?: string
}

/**
 * A temporary sign-in form for clients that do not support sign-in through quickpick.
 *
 * The form allows the user to enter the Sourcegraph instance URL and an access token.
 * It validates the input and sends the authentication information to the VSCode extension
 * when the user clicks the "Sign In with Access Token" button.
 */
const ClientSignInForm: React.FC<ClientSignInFormProps> = ({ className, authStatus }) => {
    const [formData, setFormData] = useState({
        endpoint: authStatus?.endpoint ?? '',
        accessToken: '',
    })

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }, [])

    const onBrowserSignInClick = useCallback(() => {
        getVSCodeAPI().postMessage({
            command: 'auth',
            authKind: 'callback',
            endpoint: formData.endpoint,
        })
    }, [formData.endpoint])

    const onAccessTokenSignInClick = useCallback(() => {
        getVSCodeAPI().postMessage({
            command: 'auth',
            authKind: 'signin',
            endpoint: formData.endpoint,
            value: formData.accessToken,
        })
    }, [formData])

    const onSubmit = useCallback(() => {
        if (formData.accessToken) {
            onAccessTokenSignInClick()
        } else {
            onBrowserSignInClick()
        }
    }, [formData.accessToken, onAccessTokenSignInClick, onBrowserSignInClick])

    return (
        <Form className={className} onSubmit={onSubmit}>
            <FormField name="endpoint">
                <FormLabel title="Sourcegraph Instance URL" />
                <FormControl
                    type="url"
                    name="endpoint"
                    placeholder="https://example.sourcegraphcloud.com"
                    value={formData.endpoint}
                    required
                    onChange={handleInputChange}
                />
                <FormMessage match="typeMismatch">Invalid URL.</FormMessage>
                <FormMessage match="valueMissing">URL is required.</FormMessage>
            </FormField>
            <Button type="button" className="tw-mt-1 tw-mb-6" onClick={onBrowserSignInClick}>
                <GlobeIcon size={16} /> Sign In with Browser
            </Button>

            <FormField
                name="accessToken"
                serverInvalid={authStatus && !authStatus.authenticated && authStatus.showNetworkError}
            >
                <FormLabel title="Access Token" />
                <FormControl
                    type="password"
                    name="accessToken"
                    placeholder="sgp_xxx_xxx"
                    value={formData.accessToken}
                    onChange={handleInputChange}
                    autoComplete="current-password"
                    required
                />
                <FormMessage match={() => !isSourcegraphToken(formData.accessToken)}>
                    Invalid access token.
                </FormMessage>
                <FormMessage match="valueMissing">Access token is required.</FormMessage>
            </FormField>
            <Button
                type="submit"
                className="tw-mt-1 tw-mb-6"
                onClick={onAccessTokenSignInClick}
                disabled={!formData.accessToken}
            >
                <LockKeyholeIcon size={16} /> Sign In with Access Token
            </Button>
        </Form>
    )
}
