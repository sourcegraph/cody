import type { Action, ChatMessage } from '@sourcegraph/cody-shared'
import { useClientActionDispatcher } from '../client/clientState'
import { useLocalStorage } from '../components/hooks'
import { PromptList } from '../components/promptList/PromptList'
import { View } from '../tabs/types'
import { getVSCodeAPI } from '../utils/VSCodeApi'

import { CodyIDE } from '@sourcegraph/cody-shared'
import type { PromptMode } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { useState } from 'react'
import { PromptsFilter, type PromptsFilterArgs } from '../components/promptFilter/PromptsFilter'
import { PromptMigrationWidget } from '../components/promptsMigration/PromptsMigration'
import styles from './PromptsTab.module.css'

export const PromptsTab: React.FC<{
    IDE: CodyIDE
    setView: (view: View) => void
    isPromptsV2Enabled?: boolean
}> = ({ IDE, setView, isPromptsV2Enabled }) => {
    const runAction = useActionSelect()

    const [promptsFilter, setPromptsFilter] = useState<PromptsFilterArgs>({})

    return (
        <div className="tw-overflow-auto tw-h-full tw-flex tw-flex-col tw-gap-6">
            {isPromptsV2Enabled && IDE !== CodyIDE.Web && (
                <PromptMigrationWidget dismissible={false} className={styles.promptMigrationWidget} />
            )}
            <PromptsFilter promptFilters={promptsFilter} setPromptFilters={setPromptsFilter} />
            <PromptList
                showSearch={true}
                showCommandOrigins={true}
                paddingLevels="big"
                telemetryLocation="PromptsTab"
                recommendedOnly={false}
                showOnlyPromptInsertableCommands={false}
                showPromptLibraryUnsupportedMessage={true}
                onSelect={item => runAction(item, setView)}
                className={styles.promptsContainer}
                inputClassName={styles.promptsInput}
                promptFilters={promptsFilter}
            />
        </div>
    )
}

export const promptModeToIntent = (mode?: PromptMode | undefined | null): ChatMessage['intent'] => {
    switch (mode) {
        case 'CHAT':
            return 'chat'
        case 'EDIT':
            return 'edit'
        case 'INSERT':
            return 'insert'
        default:
            return 'chat'
    }
}

export function useActionSelect() {
    const dispatchClientAction = useClientActionDispatcher()
    const [lastUsedActions = {}, persistValue] = useLocalStorage<Record<string, number>>(
        'last-used-actions-v2',
        {}
    )

    return async (action: Action, setView: (view: View) => void) => {
        try {
            const actionKey = action.actionType === 'prompt' ? action.id : action.key
            persistValue({ ...lastUsedActions, [actionKey]: Date.now() })
        } catch {
            console.error('Failed to persist last used action count')
        }

        switch (action.actionType) {
            case 'prompt': {
                setView(View.Chat)

                dispatchClientAction(
                    {
                        setPromptAsInput: {
                            text: action.definition.text,
                            mode: action.mode,
                            autoSubmit: action.autoSubmit || false,
                        },
                    },
                    // Buffer because PromptEditor is not guaranteed to be mounted after the `setView`
                    // call above, and it needs to be mounted to receive the action.
                    { buffer: true }
                )
                break
            }

            // Deprecated commands handler, starting with sg 5.10 and vscode 1.46 we
            // should never reach this case branch (since commands were replaces with prompts)
            // TODO (vk): Remove this when backward compatible commands support is sunset
            case 'command': {
                if (action.slashCommand) {
                    getVSCodeAPI().postMessage({
                        command: 'command',
                        id: action.slashCommand,
                    })
                } else {
                    getVSCodeAPI().postMessage({
                        command: 'command',
                        id: 'cody.action.command',
                        arg: action.key,
                    })
                }
                if (action.mode === 'ask' && action.type === 'default') {
                    // Chat response will show up in the same panel, so make the chat view visible.
                    setView(View.Chat)
                }
                break
            }
        }
    }
}
