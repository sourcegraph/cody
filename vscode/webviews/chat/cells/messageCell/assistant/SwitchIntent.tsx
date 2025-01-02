import type { ChatMessage } from '@sourcegraph/cody-shared'
import { Brain, MessageSquare, Search } from 'lucide-react'
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
        <div className="tw-flex tw-justify-between tw-gap-4 tw-items-center">
            <div className="tw-flex tw-gap-2 tw-text-muted-foreground tw-items-center">
                <Brain className="tw-size-8 tw-flex-shrink-0" />
                {manuallySelected ? 'User' : 'Query review'} selected a{' '}
                {intent === 'search' ? 'code search' : 'chat'} response
            </div>
            <div>
                <Button
                    size="sm"
                    variant="outline"
                    className="tw-text-prmary tw-flex tw-gap-2 tw-items-center tw-whitespace-nowrap"
                    onClick={onSwitch}
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
