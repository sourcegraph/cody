import { isDefined, telemetryRecorder } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { ScanEyeIcon } from 'lucide-react'
import { type FunctionComponent, useContext, useMemo } from 'react'
import { EnhancedContextContext } from '../../../../components/EnhancedContextSettings'
import { Button } from '../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import type { PriorHumanMessageInfo } from './AssistantMessageCell'

export const ContextFocusActions: FunctionComponent<{
    humanMessage: PriorHumanMessageInfo
    className?: string
}> = ({ humanMessage, className }) => {
    const isEnhancedContextAvailable = useContext(EnhancedContextContext).groups.some(g =>
        g.providers.some(p => p.state === 'ready')
    )

    const actions = useMemo(
        () =>
            (
                [
                    humanMessage.addEnhancedContext
                        ? {
                              label: 'Public knowledge only',
                              tooltip: 'Run query again without automatic code context',
                              onClick: () => {
                                  logRerunWithEnhancedContext(false)
                                  humanMessage.rerunWithEnhancedContext(false)
                              },
                          }
                        : isEnhancedContextAvailable
                          ? {
                                label: 'Automatic code context',
                                tooltip: 'Run query again with automatic code context',
                                onClick: () => {
                                    logRerunWithEnhancedContext(true)
                                    humanMessage.rerunWithEnhancedContext(true)
                                },
                            }
                          : null,
                    {
                        label: 'Choose files...',
                        tooltip: 'Manually @-mention specific files that contain relevant information',
                        onClick: () => {
                            telemetryRecorder.recordEvent('cody.contextSelection', 'addFile', {
                                metadata: {
                                    enhancedContext: humanMessage.addEnhancedContext ? 1 : 0,
                                },
                            })
                            humanMessage.appendAtMention()
                        },
                    },
                ] as { label: string; tooltip: string; onClick: () => void }[]
            ).filter(isDefined),
        [humanMessage, isEnhancedContextAvailable]
    )
    return actions.length > 0 ? (
        <menu className={clsx('tw-flex tw-gap-2', className)}>
            <ScanEyeIcon size={14} className="tw-flex-shrink-0 tw-mt-1" />
            <div className="tw-flex tw-items-center tw-gap-3 tw-flex-wrap">
                <h3 className="tw-whitespace-nowrap tw-flex tw-items-center tw-gap-3 tw-mr-1">
                    Try again with different context:
                </h3>
                <ul className="tw-whitespace-nowrap tw-flex tw-gap-2">
                    {actions.map(({ label, tooltip, onClick }) => (
                        <li key={label}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        key={label}
                                        variant="secondary"
                                        size="sm"
                                        className="tw-text-xs"
                                        onClick={onClick}
                                    >
                                        {label}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{tooltip}</TooltipContent>
                            </Tooltip>
                        </li>
                    ))}
                </ul>
            </div>
        </menu>
    ) : null
}

function logRerunWithEnhancedContext(withEnhancedContext: boolean): void {
    telemetryRecorder.recordEvent('cody.contextSelection', 'rerunWithRepositoryContext', {
        metadata: {
            withEnhancedContext: withEnhancedContext ? 1 : 0,
        },
    })
}
