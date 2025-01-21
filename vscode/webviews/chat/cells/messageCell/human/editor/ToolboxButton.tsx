import type { AgentToolboxSettings, WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import { type FC, memo, useCallback, useState } from 'react'
import { CODY_DOCS_CAPABILITIES_URL } from '../../../../../../src/chat/protocol'
import {
    CommandGroup,
    CommandItem,
    CommandLink,
    CommandList,
} from '../../../../../components/shadcn/ui/command'
import { Switch } from '../../../../../components/shadcn/ui/switch'
import { useTelemetryRecorder } from '../../../../../utils/telemetry'

interface ToolboxButtonProps {
    api: WebviewToExtensionAPI
    settings: AgentToolboxSettings
    backToMainMenu: () => void
}

export const ToolboxButton: FC<ToolboxButtonProps> = memo(({ settings, api, backToMainMenu }) => {
    const telemetryRecorder = useTelemetryRecorder()

    const [isLoading, setIsLoading] = useState(false)

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
        <CommandList>
            <CommandGroup>
                <CommandItem onSelect={backToMainMenu}>
                    <ArrowLeftIcon className="tw-mr-3" size={16} />
                    Back
                </CommandItem>
            </CommandGroup>
            <CommandGroup className="tw-pointer-events-none">
                <CommandItem className="!tw-bg-transparent hover:!tw-bg-transparent [&[aria-selected]]:!tw-bg-transparent">
                    <div className="tw-flex tw-flex-col tw-gap-1 tw-text-left">
                        <div
                            className="tw-flex tw-items-center tw-justify-between tw-w-full tw-font-medium tw-gap-3"
                            aria-label="chat"
                        >
                            <span className="tw-flex tw-gap-2 tw-items-center">
                                <span className="tw-font-semibold tw-text-md">Agentic chat</span>
                            </span>
                            <Switch
                                className="tw-bg-slate-400 tw-cursor-pointer"
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
                        <div className="tw-text-xs tw-text-muted-foreground">
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
                        </div>
                    </div>
                </CommandItem>
                <CommandItem className="!tw-bg-transparent hover:!tw-bg-transparent [&[aria-selected]]:!tw-bg-transparent">
                    <div className="tw-flex tw-flex-col tw-gap-1 tw-text-left">
                        <div
                            className="tw-flex tw-items-center tw-justify-between tw-w-full tw-font-medium tw-gap-3"
                            aria-label="terminal"
                        >
                            <span className="tw-flex tw-gap-2 tw-items-center">
                                <span className="tw-font-semibold tw-text-md">Terminal access</span>
                            </span>
                            <Switch
                                className="tw-bg-slate-400 tw-cursor-pointer"
                                checked={settings.shell?.enabled}
                                disabled={isLoading || !!settings.shell?.error}
                                onClick={() =>
                                    onSubmit({
                                        ...settings,
                                        shell: {
                                            enabled: !!settings.agent?.name && !settings.shell?.enabled,
                                        },
                                    })
                                }
                            />
                        </div>
                        <div className="tw-text-xs tw-text-muted-foreground">
                            Allows agents to execute commands like <code>ls</code>, <code>dir</code>,{' '}
                            <code>git</code>, and other commands for context. The agent will ask
                            permission each time it would like to run a command.
                        </div>
                    </div>
                </CommandItem>
            </CommandGroup>
            <CommandGroup>
                <CommandLink
                    key="enterprise-model-options"
                    href="https://www.agentic.ai/"
                    target="_blank"
                    rel="noreferrer"
                    onSelect={() => {
                        telemetryRecorder.recordEvent(
                            'cody.modelSelector',
                            'clickEnterpriseModelOption',
                            {
                                billingMetadata: {
                                    product: 'cody',
                                    category: 'billable',
                                },
                            }
                        )
                    }}
                >
                    <div className="tw-flex tw-items-center tw-justify-between tw-w-full tw-font-medium tw-gap-3">
                        <div className="tw-font-semibold tw-text-md">Documentation</div>
                        <ExternalLinkIcon size={16} />
                    </div>
                </CommandLink>
            </CommandGroup>
        </CommandList>
    )
})
