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

import {
    ArrowRightIcon,
    ChevronsUpDownIcon,
    CopyIcon,
    LogInIcon,
    SmartphoneIcon,
    UsersIcon,
} from 'lucide-react'
import React, { memo, useCallback, useMemo, useState } from 'react'
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

interface DeviceFlowState {
    isInProgress: boolean
    userCode?: string
    verificationUri?: string
    statusMessage?: string
    error?: string
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
    const [deviceFlowState, setDeviceFlowState] = useState<DeviceFlowState>({
        isInProgress: false,
    })

    // Listen for device flow status messages
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'device-flow-status') {
                const { status, message, userCode, verificationUri } = event.data

                setDeviceFlowState(prev => {
                    switch (status) {
                        case 'starting':
                        case 'progress':
                            return {
                                ...prev,
                                isInProgress: true,
                                statusMessage: message,
                                error: undefined,
                            }
                        case 'code-ready':
                            return {
                                ...prev,
                                isInProgress: true,
                                userCode,
                                verificationUri,
                                statusMessage: message,
                                error: undefined,
                            }
                        case 'success':
                            return {
                                isInProgress: false,
                                statusMessage: message,
                            }
                        case 'error':
                            return {
                                ...prev,
                                isInProgress: false,
                                error: message,
                            }
                        default:
                            return prev
                    }
                })
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

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

    const handleDeviceFlowSignin = useCallback(() => {
        setDeviceFlowState({ isInProgress: true })
        telemetryRecorder.recordEvent('cody.auth.device-flow', 'clicked')
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
            deviceFlow: (
                <SignInButton
                    logo={signInLogoSourcegraph}
                    alt="Sourcegraph logo"
                    provider="Device Authorization"
                    onClick={handleDeviceFlowSignin}
                    title="Authorize this device using OAuth 2.0"
                />
            ),
        }),
        [SignInButton, handleEnterpriseSignin, handleDeviceFlowSignin]
    )

    // Device flow component
    const DeviceFlowComponent = useMemo(
        () => (
            <section className="tw-bg-sidebar-background tw-text-sidebar-foreground tw-w-full tw-max-w-md">
                <div className="tw-font-semibold tw-text-md tw-my-4 tw-text-muted-foreground">
                    <DeviceFlowForm
                        vscodeAPI={vscodeAPI}
                        telemetryRecorder={telemetryRecorder}
                        deviceFlowState={deviceFlowState}
                        setDeviceFlowState={setDeviceFlowState}
                        allowEndpointChange={allowEndpointChange}
                        authStatus={authStatus}
                        className="tw-mt-8"
                    />
                </div>
            </section>
        ),
        [vscodeAPI, telemetryRecorder, deviceFlowState, allowEndpointChange, authStatus]
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
                {deviceFlowState.isInProgress ? (
                    DeviceFlowComponent
                ) : isEnterpriseSignin ? (
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
                                {signInButtons.deviceFlow}
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

interface DeviceFlowFormProps {
    vscodeAPI: VSCodeWrapper
    telemetryRecorder: TelemetryRecorder
    deviceFlowState: DeviceFlowState
    setDeviceFlowState: (state: DeviceFlowState) => void
    allowEndpointChange: boolean
    authStatus?: AuthStatus
    className?: string
}

/**
 * Device Flow authentication form for OAuth 2.0 device authorization
 */
const DeviceFlowForm: React.FC<DeviceFlowFormProps> = memo(
    ({
        className,
        vscodeAPI,
        telemetryRecorder,
        deviceFlowState,
        setDeviceFlowState,
        allowEndpointChange,
        authStatus,
    }) => {
        const [endpoint, setEndpoint] = useState(
            authStatus && !isDotCom(authStatus) ? authStatus.endpoint : ''
        )
        const [validationError, setValidationError] = useState('')

        // Validation function for URL
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

        const handleEndpointChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value
                setEndpoint(value)
                setValidationError(validateEndpointUrl(value) || '')
            },
            [validateEndpointUrl]
        )

        const handleDeviceAuth = useCallback(
            (e?: React.FormEvent) => {
                e?.preventDefault()

                if (!endpoint || validationError) {
                    return
                }

                telemetryRecorder.recordEvent('cody.auth.device-flow', 'started')

                setDeviceFlowState({
                    isInProgress: true,
                    statusMessage: 'Starting device authorization...',
                })

                vscodeAPI?.postMessage({
                    command: 'auth',
                    endpoint: endpoint,
                    authKind: 'device-flow',
                })
            },
            [endpoint, validationError, vscodeAPI, telemetryRecorder, setDeviceFlowState]
        )

        const copyUserCode = useCallback(() => {
            if (deviceFlowState.userCode) {
                navigator.clipboard.writeText(deviceFlowState.userCode)
                telemetryRecorder.recordEvent('cody.auth.device-flow.code', 'copied')
            }
        }, [deviceFlowState.userCode, telemetryRecorder])

        const goBack = useCallback(() => {
            setDeviceFlowState({ isInProgress: false })
        }, [setDeviceFlowState])

        if (deviceFlowState.isInProgress && deviceFlowState.userCode) {
            return (
                <div className={className}>
                    <div className="tw-text-center tw-mb-6">
                        <SmartphoneIcon className="tw-w-12 tw-h-12 tw-mx-auto tw-mb-4 tw-text-muted-foreground" />
                        <h3 className="tw-text-lg tw-font-semibold tw-mb-2">Device Authorization</h3>
                        <p className="tw-text-sm tw-text-muted-foreground">
                            Complete authorization in your browser
                        </p>
                    </div>

                    <div className="tw-bg-muted tw-p-4 tw-rounded-md tw-mb-4">
                        <div className="tw-text-center">
                            <div className="tw-text-sm tw-text-muted-foreground tw-mb-2">
                                Enter this code:
                            </div>
                            <div className="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-mb-3">
                                <code className="tw-text-lg tw-font-mono tw-font-bold tw-px-3 tw-py-1 tw-bg-background tw-rounded">
                                    {deviceFlowState.userCode}
                                </code>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={copyUserCode}
                                    title="Copy code"
                                >
                                    <CopyIcon size={14} />
                                </Button>
                            </div>
                            <div className="tw-text-xs tw-text-muted-foreground">
                                At: {deviceFlowState.verificationUri}
                            </div>
                        </div>
                    </div>

                    {deviceFlowState.statusMessage && (
                        <div className="tw-text-center tw-text-sm tw-text-muted-foreground tw-mb-4">
                            {deviceFlowState.statusMessage}
                        </div>
                    )}

                    {deviceFlowState.error && (
                        <div className="tw-bg-red-100 tw-border tw-border-red-400 tw-text-red-700 tw-px-4 tw-py-3 tw-rounded tw-mb-4">
                            {deviceFlowState.error}
                        </div>
                    )}

                    <Button variant="outline" onClick={goBack} className="tw-w-full">
                        ← Back
                    </Button>
                </div>
            )
        }

        return (
            <div className={className}>
                {deviceFlowState.error && (
                    <div className="tw-bg-red-100 tw-border tw-border-red-400 tw-text-red-700 tw-px-4 tw-py-3 tw-rounded tw-mb-4">
                        {deviceFlowState.error}
                    </div>
                )}

                <Form onSubmit={handleDeviceAuth}>
                    <FormField name="endpoint" className="tw-m-2">
                        <FormLabel title="Sourcegraph Instance URL" />
                        <FormControl
                            type="url"
                            name="endpoint"
                            placeholder="Example: https://instance.sourcegraph.com"
                            value={endpoint}
                            className="tw-w-full tw-my-2 !tw-p-4"
                            required
                            onChange={handleEndpointChange}
                            disabled={!allowEndpointChange || deviceFlowState.isInProgress}
                        />
                        <FormMessage match="typeMismatch">Invalid URL.</FormMessage>
                        <FormMessage match="valueMissing">URL is required.</FormMessage>
                        {validationError && (
                            <div className="tw-text-red-500 tw-text-sm tw-mt-1 tw-font-medium">
                                {validationError}
                            </div>
                        )}
                    </FormField>

                    <div className="tw-text-sm tw-text-muted-foreground tw-mb-4 tw-mx-2">
                        <SmartphoneIcon className="tw-w-4 tw-h-4 tw-inline tw-mr-2" />
                        This will authorize your device using OAuth 2.0 with short-lived tokens.
                    </div>

                    <Button
                        type="submit"
                        className="tw-m-4 tw-w-full !tw-p-4"
                        disabled={!endpoint || !!validationError || deviceFlowState.isInProgress}
                        title="Authorize This Device"
                    >
                        {deviceFlowState.isInProgress
                            ? deviceFlowState.statusMessage || 'Authorizing...'
                            : 'Authorize This Device'}
                    </Button>
                </Form>
            </div>
        )
    }
)
