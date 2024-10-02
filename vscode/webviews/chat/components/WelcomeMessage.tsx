import {
    AtSignIcon,
    type LucideProps,
    MessageSquarePlusIcon,
    SettingsIcon,
    TextIcon,
} from 'lucide-react'
import type { FunctionComponent } from 'react'
import type React from 'react'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { Kbd } from '../../components/Kbd'
import { PromptList } from '../../components/promptList/PromptList'
import { Button } from '../../components/shadcn/ui/button'
import { useActionSelect } from '../../prompts/PromptsTab'
import { View } from '../../tabs'
import { useConfig } from '../../utils/useConfig'

const MenuExample: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
    <span className="tw-p-1 tw-rounded tw-text-keybinding-foreground tw-border tw-border-keybinding-border tw-bg-keybinding-background tw-whitespace-nowrap">
        {children}
    </span>
)

type FeatureRowIcon = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

const FeatureRowInlineIcon: FunctionComponent<{
    Icon: FeatureRowIcon
}> = ({ Icon }) => (
    <Icon size={16} strokeWidth={1.25} className="tw-flex-none tw-inline-flex tw-mt-1 tw-opacity-80" />
)

const FeatureRow: FunctionComponent<{
    icon: FeatureRowIcon
    children: React.ReactNode
}> = ({ icon, children }) => (
    <div className="tw-py-2 tw-px-4 tw-inline-flex tw-gap-3 tw-text-foreground tw-items-start">
        <FeatureRowInlineIcon Icon={icon} />
        <div className="tw-grow">{children}</div>
    </div>
)

const localStorageKey = 'chat.welcome-message-dismissed'

interface WelcomeMessageProps {
    setView: (view: View) => void
}

export const WelcomeMessage: FunctionComponent<WelcomeMessageProps> = ({ setView }) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const config = useConfig()
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
                    onSelect={item => runAction(item, setView)}
                />

                <Button
                    variant="text"
                    className="tw-justify-center"
                    onClick={() => setView(View.Prompts)}
                >
                    Prompt Library
                </Button>
            </div>

            <CollapsiblePanel
                storageKey="chat-help"
                title="Chat Help"
                className="tw-mb-6 tw-mt-2"
                initialOpen={true}
            >
                <FeatureRow icon={AtSignIcon}>
                    Type <Kbd macOS="@" linuxAndWindows="@" /> to add context to your chat
                </FeatureRow>
                {config.clientCapabilities.isVSCode && (
                    <>
                        <FeatureRow icon={TextIcon}>
                            To add code context from an editor, right click and use{' '}
                            <MenuExample>Cody &gt; Add File/Selection to Cody Chat</MenuExample>
                        </FeatureRow>
                        <FeatureRow icon={MessageSquarePlusIcon}>
                            Start a new chat using <Kbd macOS="opt+L" linuxAndWindows="alt+L" />
                        </FeatureRow>
                        <FeatureRow icon={SettingsIcon}>
                            Customize chat settings with the <FeatureRowInlineIcon Icon={SettingsIcon} />{' '}
                            button, or see the{' '}
                            <a href="https://sourcegraph.com/docs/cody">documentation</a>
                        </FeatureRow>
                    </>
                )}
            </CollapsiblePanel>
        </div>
    )
}
