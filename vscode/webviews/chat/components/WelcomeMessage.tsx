import { CodyIDE } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import { Kbd } from '../../components/Kbd'
import { PromptList } from '../../components/promptList/PromptList'
import { Button } from '../../components/shadcn/ui/button'
import { useActionSelect } from '../../prompts/PromptsTab'
import { View } from '../../tabs'
import { PromptMigrationWidget } from './../../components/promptsMigration/PromptsMigration'

import { clsx } from 'clsx'
import styles from './WelcomeMessage.module.css'

const localStorageKey = 'chat.welcome-message-dismissed'

interface WelcomeMessageProps {
    setView: (view: View) => void
    IDE: CodyIDE
    isPromptsV2Enabled?: boolean
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({
    setView,
    IDE,
    isPromptsV2Enabled,
}) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const runAction = useActionSelect()
    const handleRecentlyUsed = () => {
        document.querySelector<HTMLButtonElement>("button[aria-label='Insert prompt']")?.click()
    }

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-8 tw-gap-6 tw-transition-all">
            {isPromptsV2Enabled && <PromptMigrationWidget dismissible={true} className="tw-w-full" />}
            <div className="tw-flex tw-flex-col tw-gap-4 tw-w-full">
                <PromptList
                    showSearch={false}
                    showFirstNItems={4}
                    appearanceMode="chips-list"
                    telemetryLocation="PromptsTab"
                    showCommandOrigins={true}
                    showOnlyPromptInsertableCommands={false}
                    showPromptLibraryUnsupportedMessage={false}
                    recommendedOnly={true}
                    onSelect={item => runAction(item, setView)}
                />

                <div className={clsx(styles.actions, 'tw-flex tw-py-2 tw-gap-8 tw-justify-center')}>
                    <Button
                        variant="ghost"
                        className="tw-justify-center tw-basis-0 tw-whitespace-nowrap"
                        onClick={handleRecentlyUsed}
                    >
                        Recently used{' '}
                        {IDE === CodyIDE.VSCode && <Kbd macOS="shift+r" linuxAndWindows="shift+r" />}
                    </Button>

                    <Button
                        variant="ghost"
                        className="tw-justify-center tw-basis-0 tw-whitespace-nowrap"
                        onClick={() => setView(View.Prompts)}
                    >
                        All Prompts
                    </Button>
                </div>
            </div>
        </div>
    )
}
