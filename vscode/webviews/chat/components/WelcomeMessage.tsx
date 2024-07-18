import { CodyIDE } from '@sourcegraph/cody-shared'
import {
    AtSignIcon,
    BookIcon,
    FileQuestionIcon,
    GavelIcon,
    PencilLineIcon,
    PencilRulerIcon,
    SettingsIcon,
    TextIcon,
    TextSearchIcon,
} from 'lucide-react'
import type { FunctionComponent, ReactElement } from 'react'
import { Kbd } from '../../components/Kbd'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

const IconWrapper: FunctionComponent<{ character: string }> = ({ character }) => (
    <span className="tw-font-codyicons tw-text-[16px] tw-leading-none tw-inline-block tw-translate-y-[3px] tw-mx-1">
        {character}
    </span>
)

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
        <Icon strokeWidth={1.5} width={16} height={16} className="tw-opacity-50 tw-mt-1" />
        <div className="tw-flex-1">{children}</div>
    </div>
)

const NewChatIcon: FunctionComponent = (props): ReactElement => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...props}>
        <title>New chat</title>
        <path d="M13.5 2L14 2.5V7H13V3H1V11H3.5L4 11.5V13.29L6.15 11.15L6.5 11H9V12H6.71L3.85 14.85L3 14.5V12H0.5L0 11.5V2.5L0.5 2H13.5ZM13 11H11V12H13V14H14V12H16V11H14V9H13V11Z" />
    </svg>
)

const commonCommandList = [
    { key: 'cody.command.edit-code', title: 'Edit Code', icon: PencilLineIcon },
    { key: 'cody.command.document-code', title: 'Document Code', icon: BookIcon },
    { key: 'cody.command.explain-code', title: 'Explain Code', icon: FileQuestionIcon },
    { key: 'cody.command.unit-tests', title: 'Generate Unit Tests', icon: GavelIcon },
    { key: 'cody.command.smell-code', title: 'Find Code Smell', icon: TextSearchIcon },
]

const vscodeCommandList = [
    { key: 'cody.menu.custom-commands', title: 'Custom Commands', icon: PencilRulerIcon },
]

const Commands: FunctionComponent<{ IDE: CodyIDE }> = ({ IDE }) => {
    const commandList = [...commonCommandList, ...(IDE === CodyIDE.VSCode ? vscodeCommandList : [])]

    return (
        <div className="tw-flex tw-flex-col tw-gap-2 tw-self-stretch">
            <p>Commands</p>
            <div className="tw-p-8 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                {commandList.map(({ key, title, icon: Icon }) => (
                    <FeatureRow key={key} icon={Icon}>
                        <button
                            type="button"
                            onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: key })}
                        >
                            {title}
                        </button>
                    </FeatureRow>
                ))}
            </div>
        </div>
    )
}

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
            <FeatureRow icon={NewChatIcon}>
                Start a new chat using <Kbd macOS="opt+/" linuxAndWindows="alt+/" /> or the{' '}
                <IconWrapper character="H" /> button in the top right of any file
            </FeatureRow>
            <FeatureRow icon={SettingsIcon}>
                Customize chat settings with the{' '}
                <i className="codicon codicon-settings-gear tw-translate-y-[3px] tw-mx-1" /> button, or
                see the <a href="https://sourcegraph.com/docs/cody">documentation</a>
            </FeatureRow>
        </>
    )

    return (
        <div className="tw-flex tw-flex-col tw-gap-2 tw-self-stretch">
            <p>Chat Help</p>
            <div className="tw-p-8 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
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
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-p-8 tw-gap-4">
            <Commands IDE={IDE} />
            <ChatHelp IDE={IDE} />
        </div>
    )
}
