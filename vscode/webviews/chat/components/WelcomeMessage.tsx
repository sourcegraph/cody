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
    isWorkspacesUpgradeCtaEnabled?: boolean
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({
    setView,
    IDE,
}) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const runAction = useActionSelect()

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-8 tw-gap-6 tw-transition-all tw-relative">
            <div className="tw-flex tw-flex-col tw-gap-4 tw-w-full">
                {IDE !== CodyIDE.Web && (
                    <PromptMigrationWidget dismissible={true} className="tw-w-full" />
                )}
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
            <div className="tw-mt-auto tw-w-full tw-mb-4 tw-pb-2">
                <LastConversation setView={setView} IDE={IDE} />
            </div>{' '}
        </div>
    )
}
