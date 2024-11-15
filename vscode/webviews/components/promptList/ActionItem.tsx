import { clsx } from 'clsx'
import type { FC } from 'react'

import {
    type Action,
    type CommandAction,
    CustomCommandType,
    type PromptAction,
} from '@sourcegraph/cody-shared'

import {
    BookOpen,
    BookUp2,
    FileQuestion,
    Hammer,
    PencilLine,
    PencilRuler,
    TextSearch,
} from 'lucide-react'

import { UserAvatar } from '../../components/UserAvatar'
import { Badge } from '../../components/shadcn/ui/badge'
import { CommandItem } from '../../components/shadcn/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/shadcn/ui/tooltip'

import { commandRowValue } from './utils'

import styles from './ActionItem.module.css'
import { useConfig } from '../../utils/useConfig';

interface ActionItemProps {
    action: Action
    className?: string
    onSelect: (actionCommand: string) => void
}

export const ActionItem: FC<ActionItemProps> = props => {
    const { action, className, onSelect } = props
    const { clientCapabilities } = useConfig()
    const isEditEnabled = clientCapabilities.edit !== 'none'
    const isActionEditLike = action.actionType === 'prompt'
        ? action.mode !== 'CHAT'
        : action.mode !== 'ask'

    return (
        <CommandItem
            value={commandRowValue(action)}
            disabled={!isEditEnabled && isActionEditLike}
            className={clsx(className, styles.item)}
            onSelect={onSelect}
        >
            {action.actionType === 'prompt' ? (
                <ActionPrompt prompt={action} />
            ) : (
                <ActionCommand command={action} />
            )}
        </CommandItem>
    )
}

interface ActionPromptProps {
    prompt: PromptAction
}

const ActionPrompt: FC<ActionPromptProps> = props => {
    const { prompt } = props

    return (
        <div className={styles.prompt}>
            <UserAvatar
                size={22}
                user={{ ...prompt.createdBy, endpoint: '' }}
                className={styles.promptAvatar}
            />

            <div className={styles.promptContent}>
                <div className={styles.promptTitle}>
                    <strong className={styles.promptName}>{prompt.name}</strong>
                    {prompt.draft && (
                        <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5">
                            Draft
                        </Badge>
                    )}
                    {prompt.recommended && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <BookUp2 size={12} className={styles.promptIcon} />
                            </TooltipTrigger>
                            <TooltipContent>This prompt was promoted by your admin</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                <span className={styles.promptDescription}>
                    {prompt.description ?? '(No description provided)'}
                </span>
            </div>
        </div>
    )
}

const COMMAND_ICONS: Record<
    string,
    React.ComponentType<{
        size?: string | number
        strokeWidth?: string | number
        className?: string
    }>
> = {
    edit: PencilLine,
    explain: FileQuestion,
    doc: BookOpen,
    test: Hammer,
    smell: TextSearch,
}

const COMMAND_DESCRIPTIONS: Record<string, string> = {
    edit: 'Run on a file or selection to modify code',
    explain: 'Understand the open project or file better',
    doc: 'Add comments to file or selection',
    test: 'Create tests for the open file or selected function',
    smell: 'Analyze selected code and find suspicious logic',
}

interface ActionCommandProps {
    command: CommandAction
}

const ActionCommand: FC<ActionCommandProps> = props => {
    const { command } = props
    const Icon = COMMAND_ICONS[command.key] ?? PencilRuler

    const description =
        command.type !== 'default' ? command.description : COMMAND_DESCRIPTIONS[command.key]

    return (
        <div className={styles.prompt}>
            <div className={styles.promptAvatar}>
                <Icon size={16} strokeWidth={1.5} className={styles.promptIcon} />
            </div>

            <div className={styles.promptContent}>
                <div className={styles.promptTitle}>
                    <strong className={styles.promptName}>
                        {command.type === 'default' ? command.description : command.key}
                    </strong>

                    {command.type !== 'default' && (
                        <Badge
                            variant="secondary"
                            className="tw-text-xxs tw-mt-0.5 tw-whitespace-nowrap"
                        >
                            {command.type === CustomCommandType.User
                                ? 'Local User Settings'
                                : 'Workspace Settings'}
                        </Badge>
                    )}
                </div>

                <span className={styles.promptDescription}>
                    {description ?? '(No description provided)'}
                </span>
            </div>
        </div>
    )
}
