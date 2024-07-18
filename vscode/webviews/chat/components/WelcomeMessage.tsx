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
import { Kbd } from '../../components/Kbd'
import { DefaultCommandsList } from './DefaultCommandsList'

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
}> = ({ Icon }) => <Icon size={16} strokeWidth={1.25} className="tw-flex-none tw-inline-flex" />

const FeatureRow: FunctionComponent<{
    icon: FeatureRowIcon
    children: React.ReactNode
}> = ({ icon, children }) => (
    <div className="tw-inline-flex tw-gap-2 tw-text-foreground tw-items-center">
        <FeatureRowInlineIcon Icon={icon} />
        <div className="tw-grow">{children}</div>
    </div>
)

const ChatHelp: FunctionComponent<{ IDE: CodyIDE }> = ({ IDE }) => {
    const commonFeatures = (
        <FeatureRow icon={AtSignIcon}>
            Type <Kbd macOS="@" linuxAndWindows="@" /> to add context to your chat
        </FeatureRow>
    )

    const vscodeFeatures = (
        <>
            <FeatureRow icon={TextIcon}>
                To add code context from an editor, or the file explorer, right click and use{' '}
                <MenuExample>Add to Cody Chat</MenuExample>
            </FeatureRow>
            <FeatureRow icon={MessageSquarePlusIcon}>
                Start a new chat using <Kbd macOS="opt+/" linuxAndWindows="alt+/" /> or the{' '}
                <FeatureRowInlineIcon Icon={MessageSquarePlusIcon} /> button in the top right of any file
            </FeatureRow>
            <FeatureRow icon={SettingsIcon}>
                Customize chat settings with the <FeatureRowInlineIcon Icon={SettingsIcon} /> button, or
                see the <a href="https://sourcegraph.com/docs/cody">documentation</a>
            </FeatureRow>
        </>
    )

    return (
        <div className="tw-flex tw-flex-col tw-gap-3 tw-self-stretch">
            <p className="tw-py-3">Chat Help</p>
            <div className="tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                {commonFeatures}
                {IDE === CodyIDE.VSCode && vscodeFeatures}
            </div>
        </div>
    )
}

export const localStorageKey = 'chat.welcome-message-dismissed'

export const WelcomeMessage: FunctionComponent<{ IDE: CodyIDE }> = ({ IDE }) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-p-8 tw-gap-6">
            <DefaultCommandsList IDE={IDE} />
            <ChatHelp IDE={IDE} />
        </div>
    )
}
