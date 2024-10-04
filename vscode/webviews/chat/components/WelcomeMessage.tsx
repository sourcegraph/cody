import type { FunctionComponent } from 'react'
import { PromptList } from '../../components/promptList/PromptList'
import { Button } from '../../components/shadcn/ui/button'
import { useActionSelect } from '../../prompts/PromptsTab'
import { View } from '../../tabs'

const localStorageKey = 'chat.welcome-message-dismissed'

interface WelcomeMessageProps {
    setView: (view: View) => void
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({ setView }) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const runAction = useActionSelect()

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-6 tw-gap-6 tw-transition-all">
            <div className="tw-flex tw-flex-col tw-gap-4 tw-w-full">
                <PromptList
                    showSearch={false}
                    showFirstNItems={4}
                    appearanceMode="chips-list"
                    telemetryLocation="PromptsTab"
                    showCommandOrigins={true}
                    showPromptLibraryUnsupportedMessage={false}
                    showOnlyPromptInsertableCommands={false}
                    includeEditCommandOnTop={true}
                    onSelect={item => runAction(item, setView)}
                />

                <div className="tw-flex tw-gap-8 tw-justify-center">
                    <Button
                        variant="ghost"
                        className="tw-justify-center tw-basis-0 tw-whitespace-nowrap"
                        onClick={() =>
                            document
                                .querySelector<HTMLButtonElement>("button[aria-label='Insert prompt']")
                                ?.click()
                        }
                    >
                        Recently used
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
