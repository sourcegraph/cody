import { ChevronDown, ChevronRight, ChevronsUpDown, CircleMinus, Plus } from 'lucide-react'
import type * as React from 'react'
import { type KeyboardEvent, useCallback, useState } from 'react'
import { isSourcegraphToken } from '../../src/chat/protocol'
import { Badge } from '../components/shadcn/ui/badge'
import {
    Form,
    FormControl,
    FormField,
    FormLabel,
    FormMessage,
    FormSubmit,
} from '../components/shadcn/ui/form'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { Button } from './shadcn/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from './shadcn/ui/popover'

interface AccountSwitcherProps {
    activeEndpoint: string
    endpoints: string[]
    setLoading: (loading: boolean) => void
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
    activeEndpoint,
    endpoints,
    setLoading,
}) => {
    type PopoverView = 'switch' | 'remove' | 'add'
    const [getPopoverView, serPopoverView] = useState<PopoverView>('switch')
    const [isOpen, setIsOpen] = useState(false)

    const [endpointToRemove, setEndpointToRemove] = useState<string | null>(null)
    const [addFormData, setAddFormData] = useState({
        endpoint: 'https://',
        accessToken: '',
    })

    const onKeyDownInPopoverContent = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Escape' && isOpen) {
            onOpenChange(false)
        }
    }

    const onOpenChange = (open: boolean): void => {
        setIsOpen(open)
        if (!open) {
            setEndpointToRemove(null)
            serPopoverView('switch')
            setAddFormData(() => ({
                endpoint: 'https://',
                accessToken: '',
            }))
        }
    }

    const popoverEndpointsList = endpoints.map(endpoint => (
        <span key={`${endpoint}-panel`} className="tw-flex tw-justify-between tw-items-center">
            <Button
                key={`${endpoint}-switch`}
                variant="ghost"
                onClick={() => {
                    if (endpoint !== activeEndpoint) {
                        getVSCodeAPI().postMessage({
                            command: 'auth',
                            authKind: 'signin',
                            endpoint: endpoint,
                        })
                    }
                    onOpenChange(false)
                    setLoading(true)
                }}
            >
                {endpoint}
            </Button>
            <Button
                key={`${endpoint}-remove`}
                variant="ghost"
                onClick={() => {
                    setEndpointToRemove(endpoint)
                    serPopoverView('remove')
                }}
            >
                <CircleMinus size={16} />
            </Button>
        </span>
    ))

    const popoverSwitchAccountPanel = (
        <div>
            <div className="tw-flex tw-items-center tw-gap-4 tw-mb-4">
                <Badge variant="outline" className="tw-text-xxs tw-mt-0.5">
                    Active
                </Badge>
                {activeEndpoint}
            </div>
            <div className="tw-w-full tw-border-t tw-border-border" />
            {popoverEndpointsList}
            <div className="tw-w-full tw-border-t tw-border-border" />
            <Button
                key={'add-account'}
                variant="ghost"
                onClick={() => {
                    serPopoverView('add')
                }}
            >
                <Plus size={16} />
                Add another account
            </Button>
        </div>
    )

    const popoverRemoveAccountPanel = (
        <div className="tw-flex tw-flex-col tw-gap-4 tw-p-4">
            <b>Remove Account?</b>
            <div className="tw-text-muted-foreground">{endpointToRemove}</div>
            <Button
                variant="secondary"
                className="tw-w-full tw-bg-popover tw-bg-red-500"
                onClick={() => {
                    getVSCodeAPI().postMessage({
                        command: 'auth',
                        authKind: 'signout',
                        endpoint: endpointToRemove,
                    })
                    onOpenChange(false)
                }}
            >
                Remove
            </Button>
        </div>
    )

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setAddFormData(prev => ({ ...prev, [name]: value }))
    }, [])

    function addAndSwitchAccount() {
        getVSCodeAPI().postMessage({
            command: 'auth',
            authKind: 'signin',
            endpoint: addFormData.endpoint,
            value: addFormData.accessToken,
        })
        onOpenChange(false)
    }

    const popoverAddAccountPanel = (
        <div>
            <b>Account Details</b>
            <Form onSubmit={addAndSwitchAccount}>
                <FormField name="endpoint">
                    <FormLabel title="Instance URL" />
                    <FormControl
                        type="url"
                        name="endpoint"
                        value={addFormData.endpoint}
                        required
                        onChange={handleInputChange}
                    />
                    <FormMessage match="typeMismatch">Invalid URL.</FormMessage>
                    <FormMessage match="valueMissing">URL is required.</FormMessage>
                </FormField>

                <Collapsible className="tw-w-full tw-justify-start">
                    <CollapsibleTrigger asChild className="tw-text-xs">
                        <Button variant="ghost" size="xs" className="tw-w-full tw-justify-start">
                            Access Token (Optional) <ChevronsUpDown size={16} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <FormField
                            name="accessToken"
                            // TODO: It would be nice to have some server side token validation and feedback there
                            // serverInvalid={authStatus && !authStatus.authenticated && authStatus.showNetworkError}
                            className="tw-my-2"
                        >
                            <FormControl
                                type="password"
                                name="accessToken"
                                placeholder="sgp_xxx_xxx"
                                value={addFormData.accessToken}
                                onChange={handleInputChange}
                                autoComplete="current-password"
                                required
                            />
                            <FormMessage match={() => !isSourcegraphToken(addFormData.accessToken)}>
                                Invalid access token.
                            </FormMessage>
                            <FormMessage match="valueMissing">Access token is required.</FormMessage>
                        </FormField>
                    </CollapsibleContent>
                </Collapsible>
                <FormSubmit asChild>
                    <Button
                        key={'add-account-confirmation-button'}
                        type="submit"
                        variant="ghost"
                        className="tw-w-full tw-bg-blue-500"
                        onClick={addAndSwitchAccount}
                    >
                        Add and Switch
                    </Button>
                </FormSubmit>
            </Form>
        </div>
    )

    function getPopoverContent() {
        switch (getPopoverView) {
            case 'add':
                return popoverAddAccountPanel
            case 'remove':
                return popoverRemoveAccountPanel
            case 'switch':
                return popoverSwitchAccountPanel
            default:
                return null
        }
    }

    return (
        <Popover open={isOpen} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild onClick={() => setIsOpen(!isOpen)}>
                <Button variant="secondary" className="tw-w-full tw-bg-popover">
                    <span className="tw-flex tw-justify-between tw-items-center">
                        Switch Account
                        <span className="tw-w-4">
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="tw-flex tw-flex-col tw-w-full"
                side="bottom"
                align="center"
                onKeyDown={onKeyDownInPopoverContent}
            >
                <div className="tw-w-[350px]">{getPopoverContent()}</div>
            </PopoverContent>
        </Popover>
    )
}
