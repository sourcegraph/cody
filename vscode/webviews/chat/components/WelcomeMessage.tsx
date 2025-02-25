import { CodyIDE } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import { PromptList } from '../../components/promptList/PromptList'
import { useActionSelect } from '../../prompts/PromptsTab'
import type { View } from '../../tabs'
import { PromptMigrationWidget } from './../../components/promptsMigration/PromptsMigration'
import { LastConversation } from './LastConversation'

const localStorageKey = 'chat.welcome-message-dismissed'

interface WelcomeMessageProps {
    setView: (view: View) => void
    IDE: CodyIDE
    isPromptsV2Enabled?: boolean
    isWorkspacesUpgradeCtaEnabled?: boolean
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({
    setView,
    IDE,
    isPromptsV2Enabled,
}) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const runAction = useActionSelect()

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-8 tw-gap-6 tw-transition-all tw-relative">
            {isPromptsV2Enabled && IDE !== CodyIDE.Web && (
                <PromptMigrationWidget dismissible={true} className="tw-w-full" />
            )}
            <div className="tw-flex tw-flex-col tw-gap-4 tw-w-full">
                <LastConversation setView={setView} IDE={IDE} />
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
        </div>
    )
}
