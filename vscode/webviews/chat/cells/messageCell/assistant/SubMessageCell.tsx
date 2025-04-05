import type { Guardrails } from '@sourcegraph/cody-shared'
import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { WrenchIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { ChatMessageContent } from '../../../ChatMessageContent/ChatMessageContent'
import styles from './SubMessageCell.module.css'

export const SubMessageCell: FunctionComponent<{
    piece: SubMessage
    guardrails: Guardrails
}> = ({ piece, guardrails }) => {
    return (
        <>
            {piece.text && (
                <ChatMessageContent
                    displayMarkdown={piece.text.toString()}
                    isMessageLoading={false}
                    humanMessage={null}
                    guardrails={guardrails}
                />
            )}

            {piece.step && (
                <div className={`${styles.stepContainer} tw-flex tw-items-center tw-gap-2 tw-w-fit`}>
                    <div className="tw-self-start tw-mt-1">
                        <WrenchIcon className="tw-w-8 tw-h-8" />
                    </div>
                    <div>{piece.step.content}</div>
                </div>
            )}
        </>
    )
}
