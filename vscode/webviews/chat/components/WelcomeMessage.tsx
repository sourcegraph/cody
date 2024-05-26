import { isMacOS } from '@sourcegraph/cody-shared'
import {
    AtSignIcon,
    BookOpenTextIcon,
    FileIcon,
    HelpCircleIcon,
    SettingsIcon,
    TextIcon,
    XIcon,
} from 'lucide-react'
import { type FunctionComponent, type ReactElement, useCallback, useState } from 'react'
import { Button } from '../../components/shadcn/ui/button'

const CodyIcon: FunctionComponent<{ character: string }> = ({ character }) => (
    <span className="tw-font-codyicons tw-text-[16px] tw-leading-none tw-inline-block tw-translate-y-[3px] tw-mx-1">
        {character}
    </span>
)

const Kbd: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
    <span className="tw-text-sm tw-tracking-widest tw-p-1 tw-rounded tw-text-keybinding-foreground tw-border tw-border-keybinding-border tw-bg-keybinding-background">
        {children}
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
        {<Icon strokeWidth={1.5} width={16} height={16} className="tw-opacity-50 tw-mt-1" />}
        <div className="tw-flex-1">{children}</div>
    </div>
)

const NewChatIcon: FunctionComponent = (props): ReactElement => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...props}>
        <title>New chat</title>
        <path d="M13.5 2L14 2.5V7H13V3H1V11H3.5L4 11.5V13.29L6.15 11.15L6.5 11H9V12H6.71L3.85 14.85L3 14.5V12H0.5L0 11.5V2.5L0.5 2H13.5ZM13 11H11V12H13V14H14V12H16V11H14V9H13V11Z" />
    </svg>
)

const key = 'chat.welcome-message-dismissed'

export const WelcomeMessage: FunctionComponent = () => {
    const [showMessage, setShowMessage] = useState<boolean>(localStorage.getItem(key) !== 'true')

    const onDismissClicked = useCallback((): void => {
        localStorage.setItem(key, 'true')
        setShowMessage(false)
    }, [])

    const onShowClicked = useCallback((): void => {
        localStorage.removeItem(key)
        setShowMessage(true)
    }, [])

    if (!showMessage) {
        return (
            <div className="tw-flex-1 tw-flex tw-relative tw-min-h-12">
                <div className="tw-absolute tw-bottom-0 tw-w-full tw-flex tw-justify-end tw-pb-8 tw-pr-8">
                    <button
                        type="button"
                        className="tw-text-sm tw-opacity-40 hover:tw-opacity-100 hover:tw-text-link tw-flex tw-gap-2"
                        onClick={onShowClicked}
                    >
                        <HelpCircleIcon strokeWidth={2} className="tw-h-8 tw-w-8" /> Cody Chat Help
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="tw-flex-1 tw-flex tw-justify-center tw-items-center">
            <div className="tw-m-8 tw-max-w-[24rem] tw-relative tw-p-8 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                <Button
                    variant="ghost"
                    size="icon"
                    className="tw-absolute tw-right-4 tw-top-4"
                    onClick={onDismissClicked}
                >
                    <XIcon strokeWidth={1.5} className="tw-h-8 tw-w-8" />
                </Button>
                <FeatureRow icon={AtSignIcon}>
                    Type <Kbd>@</Kbd> to add context to your chat
                </FeatureRow>
                <FeatureRow icon={TextIcon}>
                    Right click lines of code and use{' '}
                    <MenuExample>Add Selection to Cody Chat</MenuExample> to add code as context
                </FeatureRow>
                <FeatureRow icon={FileIcon}>
                    Right click files and use <MenuExample>Add File to Cody Chat</MenuExample> to add
                    files as context
                </FeatureRow>
                <FeatureRow icon={NewChatIcon}>
                    Start a new chat using <Kbd>{isMacOS() ? '⌥' : 'Alt'}+/</Kbd> or the{' '}
                    <CodyIcon character="H" /> button in the top right of any file
                </FeatureRow>
                <FeatureRow icon={SettingsIcon}>
                    Customize Cody Chat setting press the{' '}
                    <i className="codicon codicon-settings-gear tw-translate-y-[3px] tw-mx-1" /> button
                </FeatureRow>
                <FeatureRow icon={BookOpenTextIcon}>
                    For more tips and tricks, see the{' '}
                    <a href="command:cody.welcome">Getting Started Guide</a> and{' '}
                    <a href="https://sourcegraph.com/docs/cody">docs</a>.
                </FeatureRow>
            </div>
        </div>
    )
}
