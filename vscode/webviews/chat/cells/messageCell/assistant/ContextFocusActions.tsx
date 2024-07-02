import { isDefined } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, useCallback, useMemo } from 'react'
import { Button } from '../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import { useTelemetryRecorder } from '../../../../utils/telemetry'
import type {
    HumanMessageInitialContextInfo as InitialContextInfo,
    PriorHumanMessageInfo,
} from './AssistantMessageCell'

export const ContextFocusActions: FunctionComponent<{
    humanMessage: PriorHumanMessageInfo
    className?: string
}> = ({ humanMessage, className }) => {
    const telemetryRecorder = useTelemetryRecorder()

    const initialContextEventMetadata: Record<string, number> = {
        hasInitialContextRepositories: humanMessage.hasInitialContext.repositories ? 1 : 0,
        hasInitialContextFiles: humanMessage.hasInitialContext.files ? 1 : 0,
    }

    const logRerunWithDifferentContext = useCallback(
        (rerunWith: InitialContextInfo): void => {
            telemetryRecorder.recordEvent('cody.contextSelection', 'rerunWithDifferentContext', {
                metadata: {
                    ...initialContextEventMetadata,
                    rerunWithInitialContextRepositories: rerunWith.repositories ? 1 : 0,
                    rerunWithInitialContextFiles: rerunWith.files ? 1 : 0,
                },
            })
        },
        [telemetryRecorder, initialContextEventMetadata]
    )

    const actions = useMemo(
        () =>
            (
                [
                    humanMessage.hasInitialContext.repositories || humanMessage.hasInitialContext.files
                        ? {
                              label: 'Public knowledge only',
                              tooltip: 'Try again without context about your code',
                              onClick: () => {
                                  const options: InitialContextInfo = {
                                      repositories: false,
                                      files: false,
                                  }
                                  logRerunWithDifferentContext(options)
                                  humanMessage.rerunWithDifferentContext(options)
                              },
                          }
                        : null,
                    humanMessage.hasInitialContext.repositories && humanMessage.hasInitialContext.files
                        ? {
                              label: 'Current file only',
                              tooltip: 'Try again, focused on the current file',
                              onClick: () => {
                                  const options: InitialContextInfo = {
                                      repositories: false,
                                      files: true,
                                  }
                                  logRerunWithDifferentContext(options)
                                  humanMessage.rerunWithDifferentContext(options)
                              },
                          }
                        : null,
                    {
                        label: 'Add context...',
                        tooltip: 'Add relevant content to improve the response',
                        onClick: () => {
                            telemetryRecorder.recordEvent('cody.contextSelection', 'addFile', {
                                metadata: initialContextEventMetadata,
                            })
                            humanMessage.appendAtMention()
                        },
                    },
                ] as { label: string; tooltip: string; onClick: () => void }[]
            )
                .flat()
                .filter(isDefined),
        [humanMessage, telemetryRecorder, logRerunWithDifferentContext, initialContextEventMetadata]
    )
    return actions.length > 0 ? (
        <menu
            className={clsx('tw-flex tw-gap-2 tw-text-sm tw-text-muted-foreground', className)}
            role="group"
            aria-label="Try again with different context"
        >
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-4 tw-gap-y-2">
                <h3 className="tw-flex tw-items-center tw-gap-3">Try again with different context</h3>
                <ul className="tw-whitespace-nowrap tw-flex tw-gap-2 tw-flex-wrap">
                    {actions.map(({ label, tooltip, onClick }) => (
                        <li key={label}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        key={label}
                                        variant="outline"
                                        size="sm"
                                        onClick={onClick}
                                        tabIndex={-1}
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
