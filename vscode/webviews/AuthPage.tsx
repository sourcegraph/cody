import type { AuthStatus, CodyIDE, TelemetryRecorder } from '@sourcegraph/cody-shared'

import signInLogoSourcegraph from '../resources/sourcegraph-mark.svg'
import { type AuthMethod, isSourcegraphToken } from '../src/chat/protocol'
import signInLogoGitHub from './sign-in-logo-github.svg'
import signInLogoGitLab from './sign-in-logo-gitlab.svg'
import signInLogoGoogle from './sign-in-logo-google.svg'
import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'

import { ArrowLeftIcon, ArrowRightIcon, ChevronsUpDownIcon, LogInIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from './components/shadcn/ui/button'
import { Form, FormControl, FormField, FormLabel, FormMessage } from './components/shadcn/ui/form'
import { useTelemetryRecorder } from './utils/telemetry'

/**
 * A component that shows the available ways for the user to sign in or sign up.
 */
export const AuthPage: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    simplifiedLoginRedirect,
    uiKindIsWeb,
    vscodeAPI,
    authStatus,
}) => {
    const telemetryRecorder = useTelemetryRecorder()
    const [isEnterpriseSignin, setIsEnterpriseSignin] = useState(false)

    return (
        <div className="tw-flex tw-flex-col tw-w-full tw-h-full tw-p-10 tw-items-center">
            <div className="tw-w-full tw-max-w-md tw-flex-1 tw-px-6 tw-flex-col tw-items-center tw-gap-8">
                <div className="tw-w-full tw-flex tw-justify-center tw-align-middle tw-my-8">
                    <LogInIcon className="tw-border-2 tw-w-auto tw-h-auto tw-p-4 tw-border-muted-foreground tw-rounded-md" />
                    <div className="tw-ml-4">
                        <div className="tw-font-semibold tw-text-lg">Sign in to Sourcegraph</div>
                        <div className="tw-text-muted-foreground tw-text-sm">Let's get started</div>
                    </div>
                </div>
                {isEnterpriseSignin ? (
                    <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-rounded-lg tw-w-full tw-max-w-md">
                        <Button
                            onClick={() => setIsEnterpriseSignin(false)}
                            className="tw-flex tw-justify-between tw-my-8"
                            variant="ghost"
                        >
                            <ArrowLeftIcon size={16} />
                            <span className="tw-ml-3">Back</span>
                        </Button>
                        <ClientSignInForm authStatus={authStatus} vscodeAPI={vscodeAPI} />
                    </section>
                ) : (
                    <div>
                        <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-rounded-lg tw-w-full tw-max-w-md">
                            <h2 className="tw-font-semibold tw-text-lg tw-my-4">
                                Teams <span className="tw-font-normal">or</span> Enterprise
                            </h2>
                            <div className="tw-flex tw-flex-col tw-gap-6 tw-w-full">
                                <Button
                                    onClick={() => setIsEnterpriseSignin(true)}
                                    className="tw-flex tw-justify-between"
                                >
                                    <div className="tw-w-full tw-max-w-md tw-flex">
                                        <img
                                            src={signInLogoSourcegraph}
                                            alt="Sourcegraph logo"
                                            className="tw-w-[16px]"
                                        />
                                        <span className="tw-ml-3">Continue with a URL</span>
                                    </div>
                                    <ArrowRightIcon size={16} />
                                </Button>
                            </div>
                        </section>
                        <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-rounded-lg tw-w-full tw-max-w-md tw-mt-8">
                            <h2 className="tw-font-semibold tw-text-lg tw-my-4">
                                Free <span className="tw-font-normal">or</span> Pro
                            </h2>
                            <div className="tw-flex tw-flex-col tw-gap-6 tw-w-full">
                                {uiKindIsWeb ? (
                                    <WebLogin
                                        telemetryRecorder={telemetryRecorder}
                                        vscodeAPI={vscodeAPI}
                                        isCodyWeb={uiKindIsWeb}
                                    />
                                ) : (
                                    <div className="tw-flex tw-flex-col tw-gap-6 tw-w-full">
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
                                            <div className="tw-w-full tw-max-w-md tw-flex">
                                                <img
                                                    src={signInLogoGitHub}
                                                    alt="GitHub logo"
                                                    className="tw-w-[16px]"
                                                />
                                                <span className="tw-ml-3">Continue with GitHub</span>
                                            </div>
                                            <ArrowRightIcon size={16} />
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
                                            <div className="tw-w-full tw-max-w-md tw-flex">
                                                <img
                                                    src={signInLogoGitLab}
                                                    alt="GitLab logo"
                                                    className="tw-w-[16px]"
                                                />
                                                <span className="tw-ml-3">Continue with GitLab</span>
                                            </div>
                                            <ArrowRightIcon size={16} />
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
                                            <div className="tw-w-full tw-max-w-md tw-flex">
                                                <img
                                                    src={signInLogoGoogle}
                                                    alt="Google logo"
                                                    className="tw-w-[16px]"
                                                />
                                                <span className="tw-ml-3">Continue with Google</span>
                                            </div>
                                            <ArrowRightIcon size={16} />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </div>
            <footer className="tw-text-sm tw-text-muted-foreground">
                By signing in to Cody, you agree to our{' '}
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
    endpoints: string[]
    authStatus: AuthStatus
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
    const [showAccessTokenField, setShowAccessTokenField] = useState(false)
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
            <FormField name="endpoint" className="tw-m-2">
                <FormLabel title="Workspace or Instance URL" />
                <FormControl
                    type="url"
                    name="endpoint"
                    placeholder="https://instance.sourcegraphcloud.com"
                    value={formData.endpoint}
                    className="tw-w-full tw-my-2"
                    required
                    onChange={handleInputChange}
                />
                <FormMessage match="typeMismatch">Invalid URL.</FormMessage>
                <FormMessage match="valueMissing">URL is required.</FormMessage>
            </FormField>
            <FormField
                name="accessToken"
                serverInvalid={authStatus && !authStatus.authenticated && authStatus.showNetworkError}
                className="tw-m-2"
            >
                <FormLabel>
                    <div className="tw-flex tw-w-full tw-justify-between tw-align-middle">
                        <div>Access Token (Optional)</div>
                        <ChevronsUpDownIcon
                            size={14}
                            className="tw-cursor-pointer"
                            onClick={() => setShowAccessTokenField(!showAccessTokenField)}
                        />
                    </div>
                </FormLabel>
                {showAccessTokenField && (
                    <div className="tw-w-full">
                        <FormControl
                            type="password"
                            name="accessToken"
                            placeholder="Example: sgp_xxx_xxx"
                            className="tw-w-full tw-my-2"
                            value={formData.accessToken}
                            onChange={handleInputChange}
                            autoComplete="current-password"
                            required
                        />
                        <FormMessage match={() => !isSourcegraphToken(formData.accessToken)}>
                            Invalid access token.
                        </FormMessage>
                        <FormMessage match="valueMissing">Access token is required.</FormMessage>
                    </div>
                )}
            </FormField>
            <Button
                type="submit"
                className="tw-m-4 tw-w-full"
                disabled={showAccessTokenField && !formData.accessToken}
            >
                Sign In
            </Button>
        </Form>
    )
}
