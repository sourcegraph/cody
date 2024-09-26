import type { AuthStatus, ChatMessage, Model, ResolvedConfiguration } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { type FunctionComponent, useMemo } from 'react'
import { CollapsiblePanel } from './CollapsiblePanel'

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
    const models = useChatModels()
    const transcript = useTranscript()
    return (
        resolvedConfig?.configuration.internalDebugState && (
            <div className="tw-p-3 tw-bg-background tw-max-h-[70vh] tw-overflow-auto tw-flex-shrink-0">
                <h2
                    className="tw-mt-1 tw-mb-3 tw-uppercase tw-font-bold tw-text-sm tw-text-muted-foreground"
                    title="To hide, set the cody.internal.debug.state user setting to false."
                >
                    State Debug
                </h2>
                {(
                    [
                        { title: 'resolvedConfig', value: resolvedConfig },
                        {
                            title: `authStatus ${
                                authStatus ? `(${authStatus.endpoint})` : '(undefined)'
                            }`,
                            value: authStatus,
                        },
                        { title: 'models', value: models },
                        { title: 'transcript', value: transcript },
                    ] satisfies { title: string; value: unknown }[]
                ).map(({ title, value }) => (
                    <CollapsiblePanel
                        key={title}
                        title={title}
                        storageKey={`StateDebugOverlay-${title}`}
                        className="tw-text-sm"
                    >
                        <pre className="tw-max-h-[40vh] tw-overflow-auto tw-text-xs">
                            {JSON.stringify(value, null, 2)}
                        </pre>
                    </CollapsiblePanel>
                ))}
            </div>
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

function useChatModels(): Model[] | undefined {
    const models = useExtensionAPI().models
    return useObservable(useMemo(() => models(), [models])).value
}

function useTranscript(): readonly ChatMessage[] | undefined {
    const transcript = useExtensionAPI().transcript
    return useObservable(useMemo(() => transcript(), [transcript])).value
}
