import type { ChatMessage } from '@sourcegraph/cody-shared'
import { Brain, MessageSquare, Search } from 'lucide-react'
import { Button } from '../../../../components/shadcn/ui/button'

interface SwitchIntentProps {
    intent: ChatMessage['intent']
    manuallySelected: boolean
    disabled: boolean
    onSwitch?: () => void
}
export const SwitchIntent = ({ intent, manuallySelected, disabled, onSwitch }: SwitchIntentProps) => {
    if (!['chat', 'search'].includes(intent || '')) {
        return null
    }

    return (
        <div className="tw-flex tw-justify-between tw-gap-4 tw-items-center tw-py-2 tw-px-4 md:tw-py-4 md:tw-px-6 tw-text-sm tw-font-medium tw-bg-background tw-border-b tw-border-muted">
            <div className="tw-flex tw-gap-4 tw-p-1 tw-text-muted-foreground tw-items-start tw-leading-tight">
                <Brain className="tw-size-8 tw-flex-shrink-0 tw-my-1" />
                {manuallySelected ? 'User' : 'Query review'} selected a{' '}
                {intent === 'search' ? 'code search' : 'chat'} response
            </div>
            <div>
                <Button
                    size="sm"
                    variant="outline"
                    className="tw-text-primary tw-flex tw-gap-2 tw-items-center tw-whitespace-nowrap"
                    onClick={onSwitch}
                    disabled={disabled}
                >
                    {intent === 'search' ? (
                        <MessageSquare className="tw-size-8 tw-flex-shrink-0" />
                    ) : (
                        <Search className="tw-size-8 tw-flex-shrink-0" />
                    )}
                    {intent === 'search' ? 'Switch to chat' : 'Switch to search'}
                </Button>
            </div>
        </div>
    )
}
