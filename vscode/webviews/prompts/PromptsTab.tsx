import type { ComponentProps } from 'react'
import { useClientActionDispatcher } from '../client/clientState'
import {
    type PromptList,
    PromptListSuitedForNonPopover,
    type PromptOrDeprecatedCommand,
} from '../components/promptList/PromptList'
import { View } from '../tabs/types'
import { getVSCodeAPI } from '../utils/VSCodeApi'

export const PromptsTab: React.FC<{
    setView: (view: View) => void
}> = ({ setView }) => {
    const dispatchClientAction = useClientActionDispatcher()
    return (
        <div className="tw-overflow-auto tw-p-8">
            <PromptListSuitedForNonPopover
                onSelect={item => onPromptSelectInPanel(item, setView, dispatchClientAction)}
                onSelectActionLabels={onPromptSelectInPanelActionLabels}
                showCommandOrigins={true}
                showPromptLibraryUnsupportedMessage={true}
                showOnlyPromptInsertableCommands={false}
                telemetryLocation="PromptsTab"
                className="tw-border tw-border-border"
            />
        </div>
    )
}

export function onPromptSelectInPanel(
    item: PromptOrDeprecatedCommand,
    setView: (view: View) => void,
    dispatchClientAction: ReturnType<typeof useClientActionDispatcher>
): void {
    switch (item.type) {
        case 'prompt': {
            setView(View.Chat)
            dispatchClientAction(
                { appendTextToLastPromptEditor: item.value.definition.text },
                // Buffer because PromptEditor is not guaranteed to be mounted after the `setView`
                // call above, and it needs to be mounted to receive the action.
                { buffer: true }
            )
            break
        }
        case 'command': {
            if (item.value.slashCommand) {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: item.value.slashCommand,
                })
            } else {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: 'cody.action.command',
                    arg: item.value.key,
                })
            }
            if (item.value.mode === 'ask' && item.value.type === 'default') {
                // Chat response will show up in the same panel, so make the chat view visible.
                setView(View.Chat)
            }
            break
        }
    }
}

export const onPromptSelectInPanelActionLabels: NonNullable<
    ComponentProps<typeof PromptList>['onSelectActionLabels']
> = {
    command: 'run',
    prompt: 'insert',
}
