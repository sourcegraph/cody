import { CodyIDE } from '@sourcegraph/cody-shared'
import { AtSignIcon, MessageSquarePlusIcon, SettingsIcon, TextIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { Kbd } from '../../components/Kbd'
import { DefaultCommandsList } from './DefaultCommandsList'

const MenuExample: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
    <span className="tw-p-1 tw-rounded tw-text-keybinding-foreground tw-border tw-border-keybinding-border tw-bg-keybinding-background tw-whitespace-nowrap">
        {children}
    </span>
)

const FeatureRow: FunctionComponent<{
    icon: React.ComponentType<React.ComponentProps<'svg'>>
    children: React.ReactNode
}> = ({ icon: Icon, children }) => (
    <div className="tw-flex tw-flex-row tw-justify-start tw-gap-4">
        <Icon strokeWidth={1.5} width={16} height={16} className="tw-mt-1" />
        <div className="tw-flex-1">{children}</div>
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
                <MessageSquarePlusIcon
                    strokeWidth={1.5}
                    width={16}
                    height={16}
                    className="tw-inline-flex"
                />{' '}
                button in the top right of any file
            </FeatureRow>
            <FeatureRow icon={SettingsIcon}>
                Customize chat settings with the{' '}
                <SettingsIcon strokeWidth={1.5} width={16} height={16} className="tw-inline-flex" />{' '}
                button, or see the <a href="https://sourcegraph.com/docs/cody">documentation</a>
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
