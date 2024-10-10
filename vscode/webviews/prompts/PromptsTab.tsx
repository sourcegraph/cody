import type { Action } from '@sourcegraph/cody-shared'
import { useClientActionDispatcher } from '../client/clientState'
import { useLocalStorage } from '../components/hooks'
import { PromptList } from '../components/promptList/PromptList'
import { View } from '../tabs/types'
import { getVSCodeAPI } from '../utils/VSCodeApi'

import styles from './PromptsTab.module.css'

export const PromptsTab: React.FC<{
    setView: (view: View) => void
}> = ({ setView }) => {
    const runAction = useActionSelect()

    return (
        <div className="tw-overflow-auto tw-h-full">
            <PromptList
                showSearch={true}
                showCommandOrigins={true}
                paddingLevels="big"
                telemetryLocation="PromptsTab"
                showPromptLibraryUnsupportedMessage={true}
                showOnlyPromptInsertableCommands={false}
                onSelect={item => runAction(item, setView)}
                inputClassName={styles.promptsInput}
            />
        </div>
    )
}

export function useActionSelect() {
    const dispatchClientAction = useClientActionDispatcher()
    const [lastUsedActions = {}, persistValue] = useLocalStorage<Record<string, number>>(
        'last-used-actions-v2',
        {}
    )

    return (action: Action, setView: (view: View) => void) => {
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
                    { appendTextToLastPromptEditor: action.definition.text },
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
