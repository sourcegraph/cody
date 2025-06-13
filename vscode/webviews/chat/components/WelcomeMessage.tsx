import type { CodyIDE } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import { PromptList } from '../../components/promptList/PromptList'
import { useActionSelect } from '../../prompts/promptUtils'
import type { View } from '../../tabs'
import { LastConversation } from './LastConversation'
import { WelcomeNotice } from './WelcomeNotice'

const localStorageKey = 'chat.welcome-message-dismissed'

interface WelcomeMessageProps {
    setView: (view: View) => void
    IDE: CodyIDE
    isWorkspacesUpgradeCtaEnabled?: boolean
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({
    setView,
    IDE,
    isWorkspacesUpgradeCtaEnabled,
}) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const runAction = useActionSelect()

    return (
        <div className="tw-flex tw-flex-col tw-w-full tw-h-full">
            <div className="tw-flex tw-flex-col tw-gap-4 tw-pt-6">
                <PromptList
                    showSearch={false}
                    showFirstNItems={4}
                    recommendedOnly={true}
                    showCommandOrigins={true}
                    showOnlyPromptInsertableCommands={false}
                    showPromptLibraryUnsupportedMessage={false}
                    appearanceMode="chips-list"
                    telemetryLocation="WelcomeAreaPrompts"
                    onSelect={item => runAction(item, setView)}
                />
            </div>
            <div className="tw-flex tw-flex-col tw-w-full tw-mt-auto tw-mb-4">
                <LastConversation setView={setView} IDE={IDE} />
                {isWorkspacesUpgradeCtaEnabled && (
                    <div className="tw-w-full tw-max-w-lg tw-mt-4">
                        <WelcomeNotice />
                    </div>
                )}
            </div>
        </div>
    )
}
