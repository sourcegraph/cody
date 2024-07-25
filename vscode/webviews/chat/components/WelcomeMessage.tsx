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

export const localStorageKey = 'chat.welcome-message-dismissed'

export const WelcomeMessage: FunctionComponent<{ IDE: CodyIDE }> = ({ IDE }) => {
    // Remove the old welcome message dismissal key that is no longer used.
    localStorage.removeItem(localStorageKey)

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-pt-4 tw-px-8 tw-gap-10 sm:tw-pl-21 tw-transition-all">
            <CollapsiblePanel title="&#x1F6A7; This is an Experimental UI Build" closeByDefault={true}>
                We relish &#x1F32D;&nbsp;your feedback. Known issues:
                <p>
                    <b>Chat</b>
                    <ul className="tw-space-y-2">
                        <li>Old chats are not shown (CODY-2271)</li>
                        <li>New chats are not saved (CODY-2273)</li>
                        <li>Chats are not restored when reopening the editor (CODY-2283)</li>
                        <li>Insert code at cursor button doesn't work (CODY-2802)</li>
                        <li>Saving code output to a new file doesn't work (CODY-2801)</li>
                        <li>Exporting a chat doesn't work (CODY-2801)</li>
                        <li>
                            Changing accounts does not close previous account's chat panels (CODY-3045)
                        </li>
                    </ul>
                </p>
                <p>
                    <b>Context</b>
                    <ul className="tw-space-y-2">
                        <li>Chat context links to local files don't work (CODY-2799)</li>
                        <li>Default context may mention "Dummy.txt:1" (CODY-2841)</li>
                        <li>Symbol context (@#) does not work/displays errors (CODY-2913, CODY-3047)</li>
                        <li>
                            New window, new chat may display default context from first window
                            (CODY-2916)
                        </li>
                    </ul>
                </p>
                <p>
                    <b>UI</b>
                    <ul className="tw-space-y-2">
                        <li>There's no tab strip (chat, history, etc.) for Enterprise accounts</li>
                        <li>Editor tab, sidebar does not display an icon (CODY-3049)</li>
                        <li>Multiple chats may repaint rapidly, layout thrash (CODY-2842)</li>
                        <li>There are no move-to-panel, move-to-sidebar buttons (CODY-2836)</li>
                        <li>Tooltips, etc. display the wrong keyboard shortcuts (CODY-3046)</li>
                        <li>
                            Fonts do not match editor choices, code font is not monospaced (CODY-2797)
                        </li>
                    </ul>
                </p>
            </CollapsiblePanel>
            <DefaultCommandsList IDE={IDE} />
            <CollapsiblePanel title="Chat Help">
                <FeatureRow icon={AtSignIcon}>
                    Type <Kbd macOS="@" linuxAndWindows="@" /> to add context to your chat
                </FeatureRow>
                {IDE === CodyIDE.VSCode && (
                    <>
                        <FeatureRow icon={TextIcon}>
                            To add code context from an editor, right click and use{' '}
                            <MenuExample>Add to Cody Chat</MenuExample>
                        </FeatureRow>
                        <FeatureRow icon={MessageSquarePlusIcon}>
                            Start a new chat using <Kbd macOS="opt+/" linuxAndWindows="alt+/" /> or the{' '}
                            <FeatureRowInlineIcon Icon={MessageSquarePlusIcon} /> button in the top right
                            of any file
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
