import { CodyIDE } from '@sourcegraph/cody-shared'
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
import type { View } from '../../tabs'

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

export const WelcomeMessage: FunctionComponent<{ IDE: CodyIDE; setView: (view: View) => void }> = ({
    IDE,
}) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    return (
        <div className="tw-flex-1 tw-w-full tw-px-6 tw-transition-all">
            <CollapsiblePanel
                storageKey="chat-help"
                title="Chat Help"
                className="tw-mb-6 tw-mt-2"
                initialOpen={true}
            >
                <FeatureRow icon={AtSignIcon}>
                    Type <Kbd macOS="@" linuxAndWindows="@" /> to add context to your chat
                </FeatureRow>
                {IDE === CodyIDE.VSCode && (
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
