import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import { GlobeIcon, LockKeyholeIcon } from 'lucide-react'
import type React from 'react'
import styles from './ClientSignInForm.module.css'

import type { AuthStatus } from '@sourcegraph/cody-shared'
import { useCallback, useState } from 'react'
import { isSourcegraphToken } from '../../src/chat/protocol'
import { type VSCodeWrapper, getVSCodeAPI } from '../utils/VSCodeApi'
import { Form, FormControl, FormField, FormLabel, FormMessage } from './shadcn/ui/form'
import { cn } from './shadcn/utils'

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
 *
 * @param className - An optional CSS class name to apply to the form container.
 * @param authStatus - The current authentication status, which may include an error message.
 * @returns A React component that renders the sign-in form.
 */
export const ClientSignInForm: React.FC<ClientSignInFormProps> = ({
    className,
    authStatus,
    vscodeAPI,
}) => {
    const [formData, setFormData] = useState({
        endpoint: authStatus?.endpoint ?? '',
        accessToken: '',
    })

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }, [])

    const signInWithBrowser = useCallback(() => {
        vscodeAPI.postMessage({ command: 'auth', authKind: 'callback', endpoint: formData.endpoint })
    }, [formData.endpoint, vscodeAPI])

    const onSubmitClick = useCallback(() => {
        getVSCodeAPI().postMessage({
            command: 'auth',
            authKind: 'signin',
            endpoint: formData.endpoint,
            value: formData.accessToken,
        })
    }, [formData])

    return (
        <Form className={cn(styles.container, className)}>
            <FormField name="endpoint" className={styles.section}>
                <FormLabel title="Sourcegraph Instance URL" />
                <FormControl
                    className={styles.input}
                    type="url"
                    name="endpoint"
                    placeholder="https://company.sourcegraph.com"
                    value={formData.endpoint}
                    required
                    onChange={handleInputChange}
                />
                <FormMessage match={() => isInvalidURL(formData.endpoint)} className={styles.warning}>
                    Not a valid URL.
                </FormMessage>
            </FormField>
            <VSCodeButton className={styles.button} type="button" onClick={signInWithBrowser}>
                <GlobeIcon className="tw-mr-2" /> Sign In with Browser
            </VSCodeButton>
            <FormField
                name="accessToken"
                className={styles.section}
                serverInvalid={authStatus && !authStatus.authenticated && authStatus.showNetworkError}
            >
                <FormLabel title="Access Token" />
                <FormControl
                    className={styles.input}
                    type="password"
                    name="accessToken"
                    placeholder="Enter your access token"
                    value={formData.accessToken}
                    onChange={handleInputChange}
                    required
                />
                <FormMessage
                    className={styles.warning}
                    match={() => !isSourcegraphToken(formData.accessToken)}
                >
                    Please enter a valid access token.
                </FormMessage>
            </FormField>
            <VSCodeButton
                className={styles.button}
                type="button"
                onClick={onSubmitClick}
                disabled={!formData.accessToken}
            >
                <LockKeyholeIcon className="tw-mr-2" /> Sign In with Access Token
            </VSCodeButton>
        </Form>
    )
}

ClientSignInForm.displayName = 'Sign In Form'

const isInvalidURL = (url: string): boolean => {
    try {
        new URL(url)
        return false
    } catch {
        return true
    }
}
