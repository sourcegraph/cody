import type { FunctionComponent } from 'react'
import { useClientActionDispatcher } from '../../client/clientState'
import { PromptListSuitedForNonPopover } from '../../components/promptList/PromptList'
import { onPromptSelectInPanel, onPromptSelectInPanelActionLabels } from '../../prompts/PromptsTab'
import type { View } from '../../tabs'

const localStorageKey = 'chat.welcome-message-dismissed'

interface WelcomeMessageProps {
    setView: (view: View) => void
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({ setView }) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const dispatchClientAction = useClientActionDispatcher()

    return (
        <PromptListSuitedForNonPopover
            setView={setView}
            onSelect={item => onPromptSelectInPanel(item, setView, dispatchClientAction)}
            onSelectActionLabels={onPromptSelectInPanelActionLabels}
            telemetryLocation="PromptsTab"
            showCommandOrigins={true}
            showPromptLibraryUnsupportedMessage={false}
            showOnlyPromptInsertableCommands={false}
            className="tw-rounded-none"
        />
    )
}

