import type { AgentToolboxSettings, WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { BrainIcon } from 'lucide-react'
import { type FC, memo, useCallback, useState } from 'react'
import { Badge } from '../../../../../components/shadcn/ui/badge'
import { Switch } from '../../../../../components/shadcn/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../components/shadcn/ui/tooltip'
import { useTelemetryRecorder } from '../../../../../utils/telemetry'
import styles from './ToolboxButton.module.css'

interface ToolboxButtonProps {
    api: WebviewToExtensionAPI
    settings: AgentToolboxSettings
}

/**
 * A button component that provides a UI for managing agent context settings.
 * Displays a popover with toggles for agentic chat and terminal access.
 * Includes experimental features with appropriate warnings and documentation links.
 *
 * @param settings - The current agent toolbox settings
 * @param api - API interface for communicating with the extension
 */
export const ToolboxButton: FC<ToolboxButtonProps> = memo(({ settings, api }) => {
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
        <div className="tw-flex tw-items-center tw-w-full tw-flex-col tw-border-b tw-border-b-border tw-p-5">
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="tw-flex tw-items-center tw-justify-between tw-w-full tw-font-medium tw-rounded-t-md tw-focus:ring-4 tw-focus:ring-gray-200 tw-gap-2">
                        <span className="tw-flex tw-gap-2 tw-items-center tw-py-2">
                            <BrainIcon
                                size={16}
                                strokeWidth={2.5}
                                className="tw-w-8 tw-h-8 tw-text-muted-foreground"
                            />
                            <span className="tw-text-md">Agentic Chat</span>
                            <Badge variant="secondary" className={styles.badge}>
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
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    <span className="tw-text-left">
                        Agentic chat reflects on your request and uses tools to dynamically retrieve
                        relevant context, improving accuracy and response quality.
                    </span>
                </TooltipContent>
            </Tooltip>
        </div>
    )
})
