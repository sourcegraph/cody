import type { Action } from '@sourcegraph/cody-shared'
import { BookText } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '../../components/shadcn/ui/button'
import { View } from '../../tabs'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { useTabView } from '../../utils/useTabView'
import { PromptList } from '../promptList/PromptList'
import { ToolbarPopoverItem } from '../shadcn/ui/toolbar'
import { cn } from '../shadcn/utils'

export const PromptSelectField: React.FunctionComponent<{
    onSelect: (item: Action) => void
    onCloseByEscape?: () => void
    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({ onSelect, onCloseByEscape, className, __storybook__open }) => {
    const telemetryRecorder = useTelemetryRecorder()
    const { setView } = useTabView()

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                telemetryRecorder.recordEvent('cody.promptSelectField', 'open', {})
            }
        },
        [telemetryRecorder.recordEvent]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            __storybook__open={__storybook__open}
            tooltip="Insert prompt from Prompt Library"
            aria-label="Insert prompt"
            popoverContent={close => (
                <div className="tw-flex tw-flex-col tw-max-h-[500px] tw-overflow-auto">
                    <PromptList
                        onSelect={item => {
                            onSelect(item)
                            close()
                        }}
                        showSearch={true}
                        paddingLevels="middle"
                        telemetryLocation="PromptSelectField"
                        showOnlyPromptInsertableCommands={true}
                        showPromptLibraryUnsupportedMessage={true}
                        lastUsedSorting={true}
                        inputClassName="tw-bg-popover"
                    />

                    <footer className="tw-px-2 tw-py-1 tw-border-t tw-border-border tw-bg-muted">
                        <Button variant="text" onClick={() => setView(View.Prompts)}>
                            <BookText size={16} /> Browse library
                        </Button>
                    </footer>
                </div>
            )}
            popoverRootProps={{ onOpenChange }}
            popoverContentProps={{
                className: 'tw-min-w-[325px] tw-w-[75vw] tw-max-w-[550px] !tw-p-0',
                onKeyDown: onKeyDown,
                onCloseAutoFocus: event => {
                    // Prevent the popover trigger from stealing focus after the user selects an
                    // item. We want the focus to return to the editor.
                    event.preventDefault()
                },
            }}
        >
            Prompts
        </ToolbarPopoverItem>
    )
}
