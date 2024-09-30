import { CustomCommandType, type CodyCommand, type Prompt } from "@sourcegraph/cody-shared"
import type { FunctionComponent } from "react"
import type { SelectActionLabel } from "./PromptList"
import { CommandItem } from "../shadcn/ui/command"
import { Badge } from "../shadcn/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "../shadcn/ui/tooltip"
import { Button } from "../shadcn/ui/button"
import clsx from "clsx"
import { commandRowValue } from "./utils"

export const PromptCommandItem: FunctionComponent<{
    prompt: Prompt
    onSelect: (value: string) => void
    selectActionLabel: SelectActionLabel | undefined
}> = ({ prompt, onSelect, selectActionLabel }) => (
    <CommandItem
        value={commandRowValue({ type: 'prompt', value: prompt })}
        onSelect={onSelect}
        className="!tw-items-start tw-group/[cmdk-item]"
    >
        <div>
            <div className="tw-flex tw-gap-3 tw-w-full tw-items-start">
                <span>
                    <span className="tw-text-muted-foreground">{prompt.owner.namespaceName} / </span>
                    <strong>{prompt.name}</strong>
                </span>
                {prompt.draft && (
                    <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5">
                        Draft
                    </Badge>
                )}
            </div>
            {prompt.description && (
                <span className="tw-text-xs tw-text-muted-foreground tw-text-nowrap tw-overflow-hidden tw-text-ellipsis tw-w-full">
                    {prompt.description}
                </span>
            )}
        </div>
        <div className="tw-flex-grow" />
        {selectActionLabel && <CommandItemAction label={selectActionLabel} />}
    </CommandItem>
)

export const CodyCommandItem: FunctionComponent<{
    command: CodyCommand
    onSelect: (value: string) => void
    selectActionLabel: SelectActionLabel | undefined
    showCommandOrigins: boolean
}> = ({ command, onSelect, selectActionLabel, showCommandOrigins }) => (
    <CommandItem
        value={commandRowValue({ type: 'command', value: command })}
        onSelect={onSelect}
        className="!tw-items-start tw-group/[cmdk-item]"
    >
        <div>
            <div className="tw-flex tw-flex-wrap tw-gap-3 tw-w-full tw-items-start">
                <strong className="tw-whitespace-nowrap">
                    {command.type === 'default' ? command.description : command.key}
                </strong>
                {showCommandOrigins && command.type !== 'default' && (
                    <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5 tw-whitespace-nowrap">
                        {command.type === CustomCommandType.User
                            ? 'Local User Settings'
                            : 'Workspace Settings'}
                    </Badge>
                )}
            </div>
            {command.type !== 'default' && command.description && (
                <span className="tw-text-xs tw-text-muted-foreground tw-text-nowrap tw-overflow-hidden tw-text-ellipsis tw-w-full">
                    {command.description}
                </span>
            )}
        </div>
        <div className="tw-flex-grow" />
        {selectActionLabel && <CommandItemAction label={selectActionLabel} />}
    </CommandItem>
)
/** Indicator for what will occur when a CommandItem is selected. */
const CommandItemAction: FunctionComponent<{ label: SelectActionLabel; className?: string }> = ({
    label,
    className,
}) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                type="button"
                variant="default"
                size="xs"
                className={clsx(
                    'tw-tracking-tight tw-text-accent-foreground tw-opacity-30 tw-bg-transparent hover:tw-bg-transparent tw-invisible group-[[aria-selected="true"]]/[cmdk-item]:tw-visible group-hover/[cmdk-item]:tw-visible',
                    className
                )}
            >
                {label === 'insert' ? 'Insert' : 'Run'}
            </Button>
        </TooltipTrigger>
        <TooltipContent>
            {label === 'insert'
                ? 'Append prompt text to chat message'
                : 'Run command on current selection in editor'}
        </TooltipContent>
    </Tooltip>
)
