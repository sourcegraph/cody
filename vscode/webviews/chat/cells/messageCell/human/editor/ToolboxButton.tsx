import type { AgentToolboxSettings, WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { BrainIcon } from 'lucide-react'
import { type FC, memo, useCallback, useState } from 'react'
import { CODY_DOCS_CAPABILITIES_URL } from '../../../../../../src/chat/protocol'
import { Badge } from '../../../../../components/shadcn/ui/badge'
import { Button } from '../../../../../components/shadcn/ui/button'
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
        <div className="tw-flex tw-items-center">
            <ToolbarPopoverItem
                role="combobox"
                iconEnd="chevron"
                className="tw-opacity-100"
                tooltip="Chat Settings"
                aria-label="Chat Settings"
                popoverContent={_close => (
                    <div id="accordion-collapse" data-accordion="collapse" className="tw-w-full">
                        <h2 id="accordion-collapse-heading">
                            <div
                                className="tw-flex tw-items-center tw-justify-between tw-w-full tw-py-3 tw-px-5 tw-font-medium tw-border tw-border-border tw-rounded-t-md tw-focus:ring-4 tw-focus:ring-gray-200 tw-gap-3 tw-bg-[color-mix(in_lch,currentColor_10%,transparent)]"
                                title="Agentic Chat Context"
                            >
                                <span className="tw-flex tw-gap-2 tw-items-center">
                                    <span className="tw-font-semibold tw-text-md">Agentic chat</span>
                                    <Badge variant="secondary" className="tw-text-xs">
                                        Experimental
                                    </Badge>
                                </span>
                                <Switch
                                    disabled={isLoading}
                                    checked={settings.agent?.name !== undefined}
                                    onChange={() =>
                                        onSubmit({
                                            ...settings,
                                            agent: {
                                                name: settings.agent?.name ? undefined : 'deep-cody', // TODO: update name when finalized.
                                            },
                                        })
                                    }
                                />
                            </div>
                        </h2>
                        <div
                            id="accordion-collapse-body"
                            className="tw-p-5 tw-flex tw-flex-col tw-gap-3 tw-my-2"
                        >
                            <div className="tw-text-xs">
                                <span>
                                    Agentic chat reflects on your request and uses tools to dynamically
                                    retrieve relevant context, improving accuracy and response quality.{' '}
                                    <a
                                        target="_blank"
                                        rel="noreferrer"
                                        href={CODY_DOCS_CAPABILITIES_URL.href} // TODO: Replace with CODY_DOCS_AGENTIC_CHAT_URL
                                    >
                                        Read the docs
                                    </a>{' '}
                                    to learn more.
                                </span>
                            </div>
                            {/* Seperator */}
                            {settings.agent?.name && !settings.shell?.error && (
                                <div className="tw-border-b tw-border-border tw-my-2" />
                            )}
                            {/* Only shows the Terminal access option if client and instance supports it */}
                            {settings.agent?.name && !settings.shell?.error && (
                                <div>
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
                                            checked={settings.shell?.enabled}
                                            disabled={isLoading || !!settings.shell?.error}
                                            onChange={() =>
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
                                        <code>dir</code>, <code>git</code>, and other commands for
                                        context. The agent will ask permission each time it would like to
                                        run a command.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                popoverRootProps={{ onOpenChange }}
                popoverContentProps={{
                    className: 'tw-w-[250px] !tw-p-0 tw-mx-8',
                    onCloseAutoFocus: event => {
                        event.preventDefault()
                    },
                }}
            >
                <Button
                    variant="ghost"
                    size="none"
                    className={`${
                        settings.agent?.name ? 'tw-text-foreground' : 'tw-text-muted-foreground'
                    } hover:!tw-bg-transparent`}
                >
                    {settings.agent?.name ? (
                        <BrainIcon
                            size={16}
                            strokeWidth={2}
                            className="tw-w-8 tw-h-8 tw-text-green-600 tw-drop-shadow-md"
                        />
                    ) : (
                        <BrainIcon
                            size={16}
                            strokeWidth={2}
                            className="tw-w-8 tw-h-8 tw-text-muted-foreground"
                        />
                    )}
                    {isFirstMessage && <span className="tw-font-semibold">agentic chat</span>}
                </Button>
            </ToolbarPopoverItem>
        </div>
    )
})

const Switch: FC<{ checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }> =
    memo(({ checked = false, onChange, disabled = false }) => {
        return (
            <button
                onClick={e => {
                    e.preventDefault()
                    onChange?.(!checked)
                }}
                className={`tw-relative tw-flex tw-items-center tw-justify-center tw-w-11 tw-h-6 tw-rounded-full tw-ease tw-transform focus:tw-outline-offset-1 focus:tw-outline-2 tw-ring-1 ${
                    checked && !disabled
                        ? 'tw-bg-green-700 tw-ring-green-400'
                        : 'tw-bg-gray-300 tw-ring-gray-400 tw-shadow-sm'
                }`}
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
            >
                <div
                    className={`
                tw-absolute tw-left-0 tw-w-5 tw-h-6 tw-rounded-full
                tw-transition-all tw-duration-300 tw-transform tw-shadow-md
                ${checked ? 'tw-translate-x-6 tw-bg-gray-200' : 'tw-translate-x-0 tw-bg-gray-600'}
            `}
                />
            </button>
        )
    })
