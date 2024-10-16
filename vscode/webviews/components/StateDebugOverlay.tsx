import * as Tabs from '@radix-ui/react-tabs'
import type {
    AuthStatus,
    ChatMessage,
    ModelsData,
    ResolvedConfiguration,
} from '@sourcegraph/cody-shared'
import { useExtensionAPI, useInitialContextForChat, useObservable } from '@sourcegraph/prompt-editor'
import clsx from 'clsx'
import React, { type FunctionComponent, useMemo } from 'react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useLocalStorage } from './hooks'
import { Button } from './shadcn/ui/button'
import { TabContainer, TabRoot } from './shadcn/ui/tabs'

/**
 * A component that displays the current state (configuration, auth status, models, etc.) at the top
 * of the {@link CodyPanel}.
 *
 * To enable, set the `cody.internal.debug.state` user setting to `true`.
 */
export const StateDebugOverlay: FunctionComponent<Record<string, never>> = () => {
    // First, only observe the resolvedConfig so that if this overlay is disabled, we don't incur the overhead of all the other observable subscriptions.
    const resolvedConfig = useResolvedConfig()
    return (
        resolvedConfig?.configuration.internalDebugState && (
            <StateDebugOverlayInner resolvedConfig={resolvedConfig} />
        )
    )
}

const StateDebugOverlayInner: FunctionComponent<{ resolvedConfig: ResolvedConfiguration }> = ({
    resolvedConfig,
}) => {
    const authStatus = useAuthStatus()
    const modelsData = useModelsData()
    const transcript = useTranscript()
    const initialContext = useInitialContextForChat()

    type TabID =
        | 'resolvedConfig'
        | 'authStatus'
        | 'modelsData'
        | 'transcript'
        | 'initialContext'
        | 'actions'
    const tabs = useMemo<{ id: TabID; title?: string; value?: unknown }[]>(
        () => [
            { id: 'resolvedConfig', value: resolvedConfig },
            {
                id: 'authStatus',
                title: `authStatus ${
                    authStatus ? `(${new URL(authStatus.endpoint).hostname})` : '(undefined)'
                }`,
                value: authStatus,
            },
            { id: 'modelsData', value: modelsData },
            { id: 'transcript', value: transcript },
            { id: 'initialContext', value: initialContext },
            { id: 'actions', title: 'Actions' },
        ],
        [resolvedConfig, authStatus, modelsData, transcript, initialContext]
    )

    const [openTabIDs, setOpenTabIDs] = useLocalStorage<(typeof tabs)[number]['id'][] | null>(
        'cody.stateDebugOverlay.openTabs',
        null
    )
    const openTabs = useMemo(() => tabs.filter(tab => openTabIDs?.includes(tab.id)), [tabs, openTabIDs])

    return (
        resolvedConfig?.configuration.internalDebugState && (
            <TabRoot
                orientation="vertical"
                value="tabs"
                className="tw-p-3 tw-bg-background tw-max-h-[70vh] tw-shrink-0 tw-overflow-hidden tw-flex tw-flex-col-reverse"
            >
                <Tabs.List className="tw-shrink-0 tw-flex tw-gap-2 tw-flex-wrap tw-items-center">
                    <h2
                        className="tw-uppercase tw-font-bold tw-text-sm tw-text-muted-foreground"
                        title="To hide, set the cody.internal.debug.state user setting to false."
                    >
                        Debug
                    </h2>
                    {tabs.map(({ id, title }) => (
                        <Tabs.Trigger
                            key={id}
                            value={id}
                            onClick={() =>
                                setOpenTabIDs(current =>
                                    current?.includes(id)
                                        ? current?.filter(other => other !== id)
                                        : [...(current ?? []), id]
                                )
                            }
                            asChild
                        >
                            <Button
                                variant="outline"
                                size="xs"
                                className={
                                    openTabIDs?.includes(id)
                                        ? 'tw-bg-button-secondary-background-hover hover:!tw-bg-button-secondary-background-hover tw-text-foreground'
                                        : ''
                                }
                            >
                                {title ?? id}
                            </Button>
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>
                <TabContainer
                    value="tabs"
                    className={clsx(
                        'tw-flex-auto tw-outline-none !tw-gap-2 tw-flex tw-flex-col',
                        openTabs.length > 0 && 'tw-mb-3'
                    )}
                >
                    {openTabs.reverse().map(tab => (
                        <React.Fragment key={tab.id}>
                            {openTabs.length > 1 && (
                                <h2 className="tw-font-bold tw-text-xs tw-select-none tw-shrink-0 tw-mt-2">
                                    {tab.title ?? tab.id}
                                </h2>
                            )}
                            {tab.id === 'actions' ? (
                                <DebugActions className="tw-shrink-0" />
                            ) : (
                                <pre className="tw-flex-1 tw-max-h-fit tw-bg-[unset] tw-text-xxs tw-font-mono tw-resize-none tw-overflow-auto tw-border tw-border-border tw-rounded-sm">
                                    {JSON.stringify(tab.value, null, 2)}
                                </pre>
                            )}
                        </React.Fragment>
                    ))}
                </TabContainer>
            </TabRoot>
        )
    )
}

function useResolvedConfig(): ResolvedConfiguration | undefined {
    const resolvedConfig = useExtensionAPI().resolvedConfig
    return useObservable(useMemo(() => resolvedConfig(), [resolvedConfig])).value
}

function useAuthStatus(): AuthStatus | undefined {
    const authStatus = useExtensionAPI().authStatus
    return useObservable(useMemo(() => authStatus(), [authStatus])).value
}

function useModelsData(): ModelsData | null | undefined {
    const models = useExtensionAPI().models
    return useObservable(useMemo(() => models(), [models])).value
}

function useTranscript(): readonly ChatMessage[] | undefined {
    const transcript = useExtensionAPI().transcript
    return useObservable(useMemo(() => transcript(), [transcript])).value
}

const DebugActions: FunctionComponent<{ className?: string }> = ({ className }) => {
    return (
        <ul className={clsx('tw-flex tw-gap-2 tw-mb-2', className)}>
            <li>
                <Button
                    variant="secondary"
                    size="xs"
                    onClick={() =>
                        getVSCodeAPI().postMessage({
                            command: 'auth',
                            authKind: 'signout',
                        })
                    }
                >
                    Sign Out
                </Button>
            </li>
            <li>
                <Button
                    variant="secondary"
                    size="xs"
                    onClick={() =>
                        getVSCodeAPI().postMessage({
                            command: 'command',
                            id: 'cody.auth.refresh',
                        })
                    }
                >
                    Refresh Settings
                </Button>
            </li>
        </ul>
    )
}
