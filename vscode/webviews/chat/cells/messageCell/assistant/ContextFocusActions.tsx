import { isDefined } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, useCallback, useContext, useMemo } from 'react'
import { EnhancedContextContext } from '../../../../components/EnhancedContextSettings'
import { Button } from '../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import { useTelemetryRecorder } from '../../../../utils/telemetry'
import type { PriorHumanMessageInfo } from './AssistantMessageCell'

export const ContextFocusActions: FunctionComponent<{
    humanMessage: PriorHumanMessageInfo
    className?: string
}> = ({ humanMessage, className }) => {
    const telemetryRecorder = useTelemetryRecorder()

    const isEnhancedContextAvailable = useContext(EnhancedContextContext).groups.some(g =>
        g.providers.some(p => p.state === 'ready')
    )

    const logRerunWithEnhancedContext = useCallback(
        (withEnhancedContext: boolean): void => {
            telemetryRecorder.recordEvent('cody.contextSelection', 'rerunWithRepositoryContext', {
                metadata: {
                    withEnhancedContext: withEnhancedContext ? 1 : 0,
                },
            })
        },
        [telemetryRecorder]
    )

    const actions = useMemo(
        () =>
            (
                [
                    humanMessage.addEnhancedContext
                        ? {
                              label: 'Public knowledge only',
                              tooltip: 'Try again without automatic code context',
                              onClick: () => {
                                  logRerunWithEnhancedContext(false)
                                  humanMessage.rerunWithEnhancedContext(false)
                              },
                          }
                        : isEnhancedContextAvailable
                          ? {
                                label: 'Automatic code context',
                                tooltip: 'Try again with automatic code context',
                                onClick: () => {
                                    logRerunWithEnhancedContext(true)
                                    humanMessage.rerunWithEnhancedContext(true)
                                },
                            }
                          : null,
                    {
                        label: 'Add context...',
                        tooltip: '@-mention relevant content to improve chat context',
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
        [humanMessage, isEnhancedContextAvailable, telemetryRecorder, logRerunWithEnhancedContext]
    )
    return actions.length > 0 ? (
        <menu className={clsx('tw-flex tw-gap-2 tw-text-sm tw-text-muted-foreground', className)}>
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-4 tw-gap-y-2">
                <h3 className="tw-flex tw-items-center tw-gap-3">Try again with different context</h3>
                <ul className="tw-whitespace-nowrap tw-flex tw-gap-2">
                    {actions.map(({ label, tooltip, onClick }) => (
                        <li key={label}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button key={label} variant="outline" size="sm" onClick={onClick}>
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
