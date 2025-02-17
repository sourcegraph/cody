import { type ChatMessage, CodyIDE } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { BetweenHorizonalEnd, Pencil, Play, Square } from 'lucide-react'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useConfig } from '../../../../../../utils/useConfig'
import { useOmniBox } from '../../../../../../utils/useOmniBox'

export type SubmitButtonState = 'submittable' | 'emptyEditorValue' | 'waitingResponseComplete'

interface IntentOption {
    title: string | React.ReactElement
    icon: React.FC<{ className?: string }>
    intent: ChatMessage['intent']
    shortcut?: React.ReactNode
    hidden?: boolean
    disabled?: boolean
}

function getIntentOptions({
    ide,
}: {
    ide: CodyIDE
    isDotComUser: boolean
    omniBoxEnabled: boolean
}): IntentOption[] {
    const standardOneBoxIntents: IntentOption[] = []

    if (ide === CodyIDE.Web) {
        return standardOneBoxIntents
    }

    return [
        ...standardOneBoxIntents,
        {
            title: 'Edit Code',
            icon: Pencil,
            intent: 'edit',
            hidden: true,
        },
        {
            title: 'Insert Code',
            icon: BetweenHorizonalEnd,
            intent: 'insert',
            hidden: true,
        },
    ]
}

export const SubmitButton: FC<{
    onClick: (intent?: ChatMessage['intent']) => void
    isEditorFocused?: boolean
    state?: SubmitButtonState
    detectedIntent?: ChatMessage['intent']
    manuallySelectIntent: (intent?: ChatMessage['intent']) => void
}> = ({ onClick, state = 'submittable', detectedIntent, manuallySelectIntent }) => {
    const {
        clientCapabilities: { agentIDE },
        isDotComUser,
    } = useConfig()
    const omniBoxEnabled = useOmniBox()

    const { intentOptions } = useMemo(() => {
        const intentOptions = getIntentOptions({
            ide: agentIDE,
            isDotComUser,
            omniBoxEnabled,
        }).filter(option => !option.hidden)

        return {
            intentOptions,
            availableIntentOptions: intentOptions.filter(option => !option.disabled),
            disabledIntentOptions: intentOptions.filter(option => option.disabled),
        }
    }, [agentIDE, isDotComUser, omniBoxEnabled])

    const inProgress = state === 'waitingResponseComplete'

    const detectedIntentOption = intentOptions.find(option => option.intent === detectedIntent)

    const Icon = detectedIntentOption?.intent ? detectedIntentOption.icon : Play
    const iconClassName = `tw-size-6 ${
        detectedIntentOption?.intent === 'search' ? '' : 'tw-fill-current'
    }`

    if (!omniBoxEnabled || inProgress) {
        return (
            <div className="tw-flex">
                <button
                    type="submit"
                    onClick={() => onClick()}
                    className={clsx(
                        'tw-px-6 tw-py-1',
                        'tw-rounded-full',
                        'tw-w-full tw-relative tw-border tw-border-button-border tw-box-content tw-bg-button-background hover:tw-bg-button-background-hover tw-text-button-foreground',

                        'disabled:tw-bg-button-secondary-background disabled:tw-text-muted-foreground'
                    )}
                    title={inProgress ? 'Stop' : 'Send'}
                >
                    {inProgress ? (
                        <Square className="tw-size-6 tw-fill-current" />
                    ) : (
                        <Play className="tw-size-6 tw-fill-current" />
                    )}
                </button>
            </div>
        )
    }

    return (
        <div className="tw-flex tw-items-center">
            <button
                type="submit"
                onClick={() => onClick()}
                className={clsx(
                    'tw-px-3 tw-py-1 md:twpx-4 md:tw-py-2',
                    'tw-rounded-full',
                    'tw-w-full tw-relative tw-border tw-border-button-border tw-box-content tw-bg-button-background hover:tw-bg-button-background-hover tw-text-button-foreground',
                    'disabled:tw-bg-button-secondary-background disabled:tw-text-muted-foreground'
                )}
                title="Send"
            >
                <div className="tw-hidden md:tw-inline tw-flex tw-items-center tw-gap-1 tw-whitespace-nowrap tw-flex-nowrap">
                    <Icon className={iconClassName} />
                </div>
            </button>
        </div>
    )
}
