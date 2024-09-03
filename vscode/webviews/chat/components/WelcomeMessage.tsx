import { CodyIDE } from '@sourcegraph/cody-shared'
import {
    AtSignIcon,
    type LucideProps,
    MessageSquarePlusIcon,
    BookOpenTextIcon,
    TextIcon,
} from 'lucide-react'
import type { FunctionComponent } from 'react'
import type React from 'react'
import { useClientActionDispatcher } from '../../client/clientState'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { Kbd } from '../../components/Kbd'
import { PromptListSuitedForNonPopover } from '../../components/promptList/PromptList'
import { onPromptSelectInPanel, onPromptSelectInPanelActionLabels } from '../../prompts/PromptsTab'
import type { View } from '../../tabs'

const MenuExample: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
    <span className="tw-p-1 tw-rounded tw-border tw-border-keybinding-border tw-bg-keybinding-background tw-whitespace-nowrap">
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

export const WelcomeMessage: FunctionComponent<{ IDE: CodyIDE; setView: (view: View) => void }> = ({
    IDE,
    setView,
}) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    const dispatchClientAction = useClientActionDispatcher()

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-6 tw-gap-6 tw-transition-all">
            <CollapsiblePanel
                storageKey="prompts"
                title="Prompts & Commands"
                className="tw-mb-6"
                contentClassName="!tw-p-0 tw-overflow-clip"
                initialOpen={true}
            >
                <PromptListSuitedForNonPopover
                    onSelect={item => onPromptSelectInPanel(item, setView, dispatchClientAction)}
                    onSelectActionLabels={onPromptSelectInPanelActionLabels}
                    telemetryLocation="PromptsTab"
                    showCommandOrigins={true}
                    showPromptLibraryUnsupportedMessage={false}
                    showOnlyPromptInsertableCommands={false}
                    className="tw-rounded-none"
                />
            </CollapsiblePanel>
            <CollapsiblePanel
                storageKey="chat-help"
                title="Chat Help"
                className="tw-mb-12 tw-mt-8"
                initialOpen={true}
            >
                {IDE === CodyIDE.VSCode && (
                    <>
                        <FeatureRow icon={MessageSquarePlusIcon}>
                            Start a new chat using <Kbd macOS="opt+L" linuxAndWindows="alt+L" /> or the command <MenuExample>Cody: New Chat</MenuExample>
                        </FeatureRow>
                    </>
                )}
                <FeatureRow icon={AtSignIcon}>
                    Type <Kbd macOS="@" linuxAndWindows="@" /> to add context to your chat
                </FeatureRow>
                {IDE === CodyIDE.VSCode && (
                    <>
                        <FeatureRow icon={TextIcon}>
                            To add code context from an editor, right click and use{' '}
                            <MenuExample>Cody &gt; Add File/Selection to Cody Chat</MenuExample>
                        </FeatureRow>
                    </>
                )}
                <div className="tw-flex tw-justify-center tw-items-center tw-w-full tw-gap-10 tw-px-4 tw-pt-4 tw-pb-3 tw-mt-6 tw-border-t tw-border-button-border tw-transition-all">
                    <a
                        href="https://docs.sourcegraph.com/cody"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tw-text-muted-foreground hover:tw-text-button-foreground"
                    >
                        Documentation
                    </a>
                    <a
                        href="https://help.sourcegraph.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tw-text-muted-foreground hover:tw-text-button-foreground"
                    >
                        Help & Support
                    </a>
                </div>
            </CollapsiblePanel>
        </div>
    )
}
