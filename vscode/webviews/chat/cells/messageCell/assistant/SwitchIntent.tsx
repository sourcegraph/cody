import type { ChatMessage } from '@sourcegraph/cody-shared'
import { Brain, MessageSquare, Search, UserCircle2 } from 'lucide-react'
import { Button } from '../../../../components/shadcn/ui/button'

interface SwitchIntentProps {
    intent: ChatMessage['intent']
    manuallySelected: boolean
    onSwitch?: () => void
}
export const SwitchIntent = ({ intent, manuallySelected, onSwitch }: SwitchIntentProps) => {
    if (!['chat', 'search'].includes(intent || '')) {
        return null
    }

    return (
        <div className="tw-flex tw-justify-between tw-gap-6 tw-items-center tw-py-2 tw-px-4 md:tw-p-4 tw-text-sm tw-font-medium">
            <div className="tw-flex tw-gap-4 tw-py-2 tw-text-muted-foreground">
                {manuallySelected ? (
                    <UserCircle2 className="tw-size-8 tw-flex-shrink-0" />
                ) : (
                    <Brain className="tw-size-8 tw-flex-shrink-0" />
                )}
                <span className="tw-leading-tight">
                    {manuallySelected ? 'You' : 'Intent detection'} selected a{' '}
                    {intent === 'search' ? 'code search' : 'chat'} response
                </span>
            </div>
            <div>
                <Button
                    size="sm"
                    variant="outline"
                    className="tw-text-primary tw-flex tw-gap-2 tw-items-center tw-whitespace-nowrap"
                    onClick={onSwitch}
                >
                    {intent === 'search' ? (
                        <MessageSquare className="tw-size-6 tw-flex-shrink-0" />
                    ) : (
                        <Search className="tw-size-6 tw-flex-shrink-0" />
                    )}
                    {intent === 'search' ? 'Switch to chat' : 'Switch to search'}
                </Button>
            </div>
        </div>
    )
}
