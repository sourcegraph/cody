import { useClientActionDispatcher } from '../client/clientState'
import {
    PromptList,
} from '../components/promptList/PromptList'
import { View } from '../tabs/types'
import { Prompt } from '@sourcegraph/cody-shared'

export const PromptsTab: React.FC<{
    setView: (view: View) => void
}> = ({ setView }) => {
    return (
        <div className="tw-overflow-auto tw-p-8">
            <PromptList setView={setView} />
        </div>
    )
}

export function onPromptSelectInPanel(
    item: Prompt,
    setView: (view: View) => void,
    dispatchClientAction: ReturnType<typeof useClientActionDispatcher>
): void {
    setView(View.Chat)
    dispatchClientAction(
        { appendTextToLastPromptEditor: item.definition.text },
        // Buffer because PromptEditor is not guaranteed to be mounted after the `setView`
        // call above, and it needs to be mounted to receive the action.
        { buffer: true }
    )
}
