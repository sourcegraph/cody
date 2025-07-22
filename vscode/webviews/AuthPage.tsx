import {
    type AuthStatus,
    type CodyIDE,
    type TelemetryRecorder,
    isAuthError,
    isAvailabilityError,
    isDotCom,
    isWorkspaceInstance,
} from '@sourcegraph/cody-shared'

import signInLogoSourcegraph from '../resources/sourcegraph-mark.svg'
import { type AuthMethod, isSourcegraphToken } from '../src/chat/protocol'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { ArrowRightIcon, ChevronsUpDownIcon, LogInIcon, UsersIcon } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { Button } from './components/shadcn/ui/button'
import { Form, FormControl, FormField, FormLabel, FormMessage } from './components/shadcn/ui/form'
import { useTelemetryRecorder } from './utils/telemetry'

interface LoginProps {
    simplifiedLoginRedirect: (method: AuthMethod) => void
    vscodeAPI: VSCodeWrapper
    codyIDE: CodyIDE
    endpoints: string[]
    authStatus: AuthStatus
    allowEndpointChange: boolean
}

interface SignInButtonProps {
    logo: string
    alt: string
    provider: string
    onClick: () => void
    title: string
}

/**
 * A component that shows the available ways for the user to sign in or sign up.
 */
export const AuthPage: React.FunctionComponent<React.PropsWithoutRef<LoginProps>> = ({
    vscodeAPI,
    authStatus,
    allowEndpointChange,
}) => {
    const telemetryRecorder = useTelemetryRecorder()
    const [isEnterpriseSignin, setIsEnterpriseSignin] = useState(true)

    // Extracted common button props and styles
    const commonButtonProps = {
        className: 'tw-flex tw-justify-between !tw-p-4',
        variant: 'secondary' as const,
    }

    const commonLogoStyle = 'tw-w-[16px] tw-mr-3'

    // Memoized button components to prevent unnecessary re-renders
    const SignInButton = useCallback(
        ({ logo, alt, provider, onClick, title }: SignInButtonProps) => (
            <Button {...commonButtonProps} onClick={onClick} title={title}>
                <div className="tw-w-full tw-max-w-md tw-flex">
                    <img src={logo} alt={alt} className={commonLogoStyle} />
                    <span>
                        Continue with <span className="tw-font-semibold">{provider}</span>
                    </span>
                </div>
                <ArrowRightIcon size={16} />
            </Button>
        ),
        [commonButtonProps]
    )

    // Memoized handler functions
    const handleEnterpriseSignin = useCallback(() => {
        setIsEnterpriseSignin(true)
        telemetryRecorder.recordEvent('cody.auth.login', 'clicked')
    }, [telemetryRecorder])

    const signInButtons = useMemo(
        () => ({
            url: (
                <SignInButton
                    logo={signInLogoSourcegraph}
                    alt="Sourcegraph logo"
                    provider="a URL"
                    onClick={handleEnterpriseSignin}
                    title="Sign in to your Sourcegraph instance"
                />
            ),
        }),
        [SignInButton, handleEnterpriseSignin]
    )

    // Memoized section components
    const BackButton = useMemo(
        () => (
            <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-w-full tw-max-w-md">
                <div className="tw-font-semibold tw-text-md tw-my-4 tw-text-muted-foreground">
                    <ClientSignInForm
                        authStatus={authStatus}
                        vscodeAPI={vscodeAPI}
                        className="tw-mt-8"
                        telemetryRecorder={telemetryRecorder}
                        allowEndpointChange={allowEndpointChange}
                    />
                </div>
            </section>
        ),
        [authStatus, vscodeAPI, telemetryRecorder, allowEndpointChange]
    )

    return (
        <div className="tw-flex tw-flex-col tw-w-full tw-h-full tw-p-10 tw-items-center">
            <div className="tw-w-full tw-max-w-md tw-flex-1 tw-px-6 tw-flex-col tw-items-center tw-gap-8">
                {/* Header section */}
                <div className="tw-w-full tw-flex tw-justify-start tw-mt-8 tw-mb-[10%]">
                    <LogInIcon className="tw-w-auto tw-h-auto tw-p-4 tw-border tw-text-keybinding-foreground tw-border-muted-foreground tw-bg-keybinding-background tw-rounded-md" />
                    <div className="tw-ml-4">
                        <div className="tw-font-semibold tw-text-lg">Sign in to Sourcegraph</div>
                        <div className="tw-text-muted-foreground tw-text-sm">Let's get you started</div>
                    </div>
                </div>
                {isEnterpriseSignin ? (
                    BackButton
                ) : (
                    <div>
                        {/* Enterprise section */}
                        <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-w-full tw-max-w-md tw-mt-8">
                            <div className="tw-flex tw-font-semibold tw-text-md tw-my-4 tw-text-muted-foreground">
                                <span>
                                    <UsersIcon className="tw-w-[16px] tw-mr-3 tw-inline-block" />
                                    Enterprise
                                    {/* Teams <span className="tw-font-normal">or</span> Enterprise */}
                                </span>
                            </div>
                            <div className="tw-flex tw-flex-col tw-gap-6 tw-w-full">
                                {signInButtons.url}
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
interface ClientSignInFormProps {
    vscodeAPI: VSCodeWrapper
    telemetryRecorder: TelemetryRecorder
    allowEndpointChange: boolean
    authStatus?: AuthStatus
    className?: string
}

/**
 * The form allows users to input their Sourcegraph instance URL and access token manually.
 */
const ClientSignInForm: React.FC<ClientSignInFormProps> = memo(
    ({ className, authStatus, vscodeAPI, telemetryRecorder, allowEndpointChange }) => {
        // Combine related state into a single object to reduce re-renders
        const [formState, setFormState] = useState({
            showAccessTokenField: false,
            isSubmitting: false,
            showAuthError: false,
            validationError: '',
            formData: {
                endpoint: authStatus && !isDotCom(authStatus) ? authStatus.endpoint : '',
                accessToken: '',
            },
        })

        // Validation function for URL based on feature flag
        const validateEndpointUrl = (url: string): string | null => {
            if (!url) return null

            try {
                const urlObj = new URL(url)
                if (
                    isDotCom({ endpoint: urlObj.href }) ||
                    isWorkspaceInstance({ endpoint: urlObj.href })
                ) {
                    return 'This instance does not have access to Cody'
                }
                return null
            } catch {
                return 'Invalid URL format'
            }
        }

        // Memoize handlers to prevent unnecessary re-creations
        const handleInputChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const { name, value } = e.target
                setFormState(prev => ({
                    ...prev,
                    validationError:
                        name === 'endpoint' ? validateEndpointUrl(value) || '' : prev.validationError,
                    formData: { ...prev.formData, [name]: value },
                }))
            },
            [validateEndpointUrl]
        )

        const toggleAccessTokenField = useCallback(() => {
            setFormState(prev => ({
                ...prev,
                showAccessTokenField: !prev.showAccessTokenField,
            }))
            telemetryRecorder.recordEvent('cody.auth.login.token', 'clicked')
        }, [telemetryRecorder])

        const onSubmit = useCallback(
            (e?: React.FormEvent) => {
                e?.preventDefault()

                if (
                    formState.isSubmitting ||
                    !formState.formData.endpoint ||
                    formState.validationError
                ) {
                    return
                }

                setFormState(prev => ({ ...prev, isSubmitting: true, showAuthError: false }))

                try {
                    vscodeAPI?.postMessage({
                        command: 'auth',
                        endpoint: formState.formData.endpoint,
                        ...(formState.showAccessTokenField && formState.formData.accessToken
                            ? { authKind: 'signin', value: formState.formData.accessToken }
                            : { authKind: 'callback' }),
                    })
                } finally {
                    setTimeout(() => {
                        setFormState(prev => ({
                            ...prev,
                            isSubmitting: false,
                            showAuthError: !!authStatus?.authenticated || isAuthError(authStatus?.error),
                        }))
                    }, 8000)
                }
            },
            [vscodeAPI, authStatus, formState]
        )

        return (
            <div className={className}>
                {!formState.isSubmitting && formState.showAuthError && formState.formData.endpoint && (
                    <div className="tw-w-full tw-font-normal tw-items-center tw-py-10 tw-mt-5 tw-mb-10 tw-bg-rose-300 tw-border-rose-400 tw-text-gray-800 tw-rounded-md tw-text-center">
                        Something went wrong while trying to log you in to {formState.formData.endpoint}.
                        Please try again.
                    </div>
                )}
                <Form onSubmit={onSubmit}>
                    <FormField name="endpoint" className="tw-m-2">
                        <FormLabel title="Sourcegraph Instance URL" />
                        <FormControl
                            type="url"
                            name="endpoint"
                            placeholder="Example: https://instance.sourcegraph.com"
                            value={formState.formData.endpoint}
                            className="tw-w-full tw-my-2 !tw-p-4"
                            required
                            onChange={handleInputChange}
                            disabled={!allowEndpointChange}
                        />
                        <FormMessage match="typeMismatch">Invalid URL.</FormMessage>
                        <FormMessage match="valueMissing">URL is required.</FormMessage>
                        {formState.validationError && (
                            <div className="tw-text-red-500 tw-text-sm tw-mt-1 tw-font-medium">
                                {formState.validationError}
                            </div>
                        )}
                    </FormField>
                    <FormField
                        name="accessToken"
                        serverInvalid={
                            authStatus &&
                            !authStatus.authenticated &&
                            isAvailabilityError(authStatus?.error)
                        }
                        className="tw-m-2"
                    >
                        <FormLabel
                            className="tw-cursor-pointer tw-flex tw-w-full tw-justify-between tw-align-middle tw-opacity-70"
                            onClick={toggleAccessTokenField}
                        >
                            <div title="Enter your access token manually">Access Token (Optional)</div>
                            <ChevronsUpDownIcon size={14} />
                        </FormLabel>
                        {formState.showAccessTokenField && (
                            <div className="tw-w-full">
                                <FormControl
                                    type="password"
                                    name="accessToken"
                                    placeholder="Access token..."
                                    className="tw-w-full tw-my-2 !tw-p-4"
                                    value={formState.formData.accessToken}
                                    onChange={handleInputChange}
                                    autoComplete="current-password"
                                    required
                                />
                                <FormMessage
                                    match={() => !isSourcegraphToken(formState.formData.accessToken)}
                                >
                                    Invalid access token.
                                </FormMessage>
                                <FormMessage match="valueMissing">Access token is required.</FormMessage>
                            </div>
                        )}
                    </FormField>
                    <Button
                        type="submit"
                        className="tw-m-4 tw-w-full !tw-p-4"
                        disabled={
                            formState.isSubmitting ||
                            !!formState.validationError ||
                            (formState.showAccessTokenField && !formState.formData.accessToken)
                        }
                        title={formState.showAccessTokenField ? 'Continue in your browser' : 'Sign in'}
                        autoFocus={true}
                    >
                        {formState.isSubmitting ? 'Signing In...' : 'Sign In'}
                    </Button>
                </Form>
            </div>
        )
    }
)
