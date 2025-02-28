import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { WrenchIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { ChatMessageContent } from '../../../ChatMessageContent/ChatMessageContent'

export const SubMessageCell: FunctionComponent<{
    piece: SubMessage
}> = ({ piece }) => {
    return (
        <>
            {piece.text && (
                <ChatMessageContent
                    displayMarkdown={piece.text.toString()}
                    isMessageLoading={false}
                    humanMessage={null}
                />
            )}

            {piece.step && (
                <div className="tw-flex tw-items-center tw-p-4 tw-gap-2 tw-w-full tw-my-2 tw-text-muted-foreground tw-rounded-sm">
                    <div className="tw-self-start tw-mt-1 tw-flex-shrink-0">
                        <WrenchIcon className="tw-w-8 tw-h-8" />
                    </div>
                    <div className="tw-flex-1 tw-pretty">{piece.step.content}</div>
                </div>
            )}
        </>
    )
}
