import type { AgentToolboxSettings, WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { BrainIcon } from 'lucide-react'
import { type FC, memo, useCallback, useState } from 'react'
import { CODY_DOCS_CAPABILITIES_URL } from '../../../../../../src/chat/protocol'
import { Badge } from '../../../../../components/shadcn/ui/badge'
import { Switch } from '../../../../../components/shadcn/ui/switch'
import { ToolbarPopoverItem } from '../../../../../components/shadcn/ui/toolbar'
import { useTelemetryRecorder } from '../../../../../utils/telemetry'

interface ToolboxButtonProps {
    api: WebviewToExtensionAPI
    settings: AgentToolboxSettings
    isFirstMessage: boolean
}

/**
 * A button component that provides a UI for managing agent context settings.
 * Displays a popover with toggles for agentic chat and terminal access.
 * Includes experimental features with appropriate warnings and documentation links.
 *
 * @param settings - The current agent toolbox settings
 * @param api - API interface for communicating with the extension
 */
export const ToolboxButton: FC<ToolboxButtonProps> = memo(({ settings, api, isFirstMessage }) => {
    const telemetryRecorder = useTelemetryRecorder()

    const [isLoading, setIsLoading] = useState(false)

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                telemetryRecorder.recordEvent('cody.toolboxSettings', 'opened', {
                    billingMetadata: { product: 'cody', category: 'billable' },
                })
            }
        },
        [telemetryRecorder.recordEvent]
    )

    const debouncedSubmit = useCallback(
        debounce((newSettings: AgentToolboxSettings) => {
            if (isLoading) {
                return
            }
            setIsLoading(true)
            if (settings !== newSettings) {
                telemetryRecorder.recordEvent('cody.toolboxSettings', 'updated', {
                    billingMetadata: { product: 'cody', category: 'billable' },
                    metadata: {
                        agent: newSettings.agent?.name ? 1 : 0,
                        shell: newSettings.shell?.enabled ? 1 : 0,
                    },
                })
            }
            const subscription = api.updateToolboxSettings(newSettings).subscribe({
                next: () => {
                    setIsLoading(false)
                    close()
                },
                error: error => {
                    console.error('updateToolboxSettings:', error)
                    setIsLoading(false)
                },
                complete: () => {
                    setIsLoading(false)
                },
            })
            return () => {
                subscription.unsubscribe()
            }
        }, 500), // 500ms delay between calls
        []
    )

    function onSubmit(newSettings: AgentToolboxSettings): void {
        setIsLoading(true)
        debouncedSubmit(newSettings)
    }

    return (
        <div className="tw-flex tw-items-center tw-w-full">
            <ToolbarPopoverItem
                role="combobox"
                iconEnd={null}
                className="tw-opacity-100 tw-w-full tw-p-0"
                tooltip={
                    <span className="tw-text-left">
                        Agentic chat reflects on your request and uses tools to dynamically retrieve
                        relevant context, improving accuracy and response quality.{' '}
                        <a
                            target="_blank"
                            rel="noreferrer"
                            href={CODY_DOCS_CAPABILITIES_URL.href} // TODO: Replace with CODY_DOCS_AGENTIC_CHAT_URL
                        >
                            Read the docs
                        </a>{' '}
                        to learn more.
                    </span>
                }
                aria-label="Chat Settings"
                popoverContent={_close => (
                    <div id="accordion-collapse" data-accordion="collapse" className="tw-w-full">
                        {/* Only shows the Terminal access option if client and instance supports it */}
                        {settings.agent?.name && !settings.shell?.error && (
                            <div
                                id="accordion-collapse-body"
                                className="tw-p-5 tw-flex tw-flex-col tw-gap-3 tw-my-2 tw-text-left"
                            >
                                <div
                                    className="tw-flex tw-items-center tw-justify-between tw-w-full tw-font-medium tw-gap-3"
                                    aria-label="terminal"
                                >
                                    <span className="tw-flex tw-gap-2 tw-items-center">
                                        <span className="tw-font-semibold tw-text-md">
                                            Terminal access
                                        </span>
                                    </span>
                                    <Switch
                                        className="tw-bg-slate-400"
                                        checked={settings.shell?.enabled}
                                        disabled={isLoading || !!settings.shell?.error}
                                        onClick={() =>
                                            onSubmit({
                                                ...settings,
                                                shell: {
                                                    enabled:
                                                        !!settings.agent?.name &&
                                                        !settings.shell?.enabled,
                                                },
                                            })
                                        }
                                    />
                                </div>
                                <div className="tw-text-xs tw-mt-2">
                                    Allows agents to execute commands like <code>ls</code>,{' '}
                                    <code>dir</code>, <code>git</code>, and other commands for context.
                                    The agent will ask permission each time it would like to run a
                                    command.
                                </div>
                            </div>
                        )}
                    </div>
                )}
                popoverRootProps={{ onOpenChange }}
                popoverContentProps={{
                    side: 'bottom',
                    className: 'tw-max-w-1/2 !tw-p-0 tw-mr-4',
                    onCloseAutoFocus: event => {
                        event.preventDefault()
                    },
                }}
            >
                <div className="tw-flex tw-items-center tw-justify-between tw-w-full tw-py-3 tw-px-5 tw-font-medium tw-border tw-border-border tw-rounded-t-md tw-focus:ring-4 tw-focus:ring-gray-200 tw-gap-3 tw-bg-[color-mix(in_lch,currentColor_10%,transparent)]">
                    <span className="tw-flex tw-gap-2 tw-items-center tw-py-2">
                        <BrainIcon
                            size={16}
                            strokeWidth={2.5}
                            className="tw-w-8 tw-h-8 tw-text-muted-foreground"
                        />
                        <span className="tw-font-semibold tw-text-md">Agentic chat</span>
                        <Badge variant="secondary" className="tw-text-xs tw-py-1">
                            Experimental
                        </Badge>
                    </span>
                    <Switch
                        className="tw-bg-slate-400"
                        checked={settings.agent?.name !== undefined}
                        onClick={() =>
                            onSubmit({
                                ...settings,
                                agent: {
                                    name: settings.agent?.name ? undefined : 'deep-cody', // TODO: update name when finalized.
                                },
                            })
                        }
                    />
                </div>
            </ToolbarPopoverItem>
        </div>
    )
})
