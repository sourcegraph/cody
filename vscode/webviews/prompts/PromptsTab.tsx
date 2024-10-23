import type { Action, ChatMessage } from '@sourcegraph/cody-shared'
import { useClientActionDispatcher } from '../client/clientState'
import { useLocalStorage } from '../components/hooks'
import { PromptList } from '../components/promptList/PromptList'
import { View } from '../tabs/types'
import { getVSCodeAPI } from '../utils/VSCodeApi'

import { firstValueFrom } from '@sourcegraph/cody-shared'
import type { PromptMode } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import { PromptMigrationWidget } from '../components/promptsMigration/PromptsMigration'
import styles from './PromptsTab.module.css'

export const PromptsTab: React.FC<{
    setView: (view: View) => void
    isUnifiedPromptsEnabled?: boolean
}> = ({ setView, isUnifiedPromptsEnabled }) => {
    const runAction = useActionSelect()

    return (
        <div className="tw-overflow-auto tw-h-full tw-flex tw-flex-col tw-gap-6">
            {isUnifiedPromptsEnabled && (
                <PromptMigrationWidget dismissible={false} className={styles.promptMigrationWidget} />
            )}
            <PromptList
                showSearch={true}
                showCommandOrigins={true}
                paddingLevels="big"
                telemetryLocation="PromptsTab"
                showPromptLibraryUnsupportedMessage={true}
                showOnlyPromptInsertableCommands={false}
                onSelect={item => runAction(item, setView)}
                className={styles.promptsContainer}
                inputClassName={styles.promptsInput}
            />
        </div>
    )
}

const promptModeToIntent = (mode?: PromptMode): ChatMessage['intent'] => {
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
    const extensionAPI = useExtensionAPI()
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
                const promptEditorState = await firstValueFrom(
                    extensionAPI.hydratePromptMessage(action.definition.text)
                )

                dispatchClientAction(
                    {
                        editorState: promptEditorState,
                        setLastHumanInputIntent: promptModeToIntent(action.mode),
                        submitHumanInput: action.autoSubmit,
                    },
                    // Buffer because PromptEditor is not guaranteed to be mounted after the `setView`
                    // call above, and it needs to be mounted to receive the action.
                    { buffer: true }
                )
                break
            }
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
