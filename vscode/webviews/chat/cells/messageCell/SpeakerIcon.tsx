import type { ChatMessage, ModelProvider } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../../../Chat'
import { chatModelIconComponent } from '../../../components/ChatModelIcon'
import { UserAvatar } from '../../../components/UserAvatar'

/**
 * A component that shows the user's avatar for human messages and the LLM's icon for assistant
 * messages.
 */
export const SpeakerIcon: FunctionComponent<{
    message: Pick<ChatMessage, 'speaker'>
    userInfo: UserAccountInfo
    chatModel: Pick<ModelProvider, 'model' | 'title' | 'provider'> | undefined
    size: number
}> = ({ message, userInfo: { user }, chatModel, size }) => {
    if (message.speaker === 'human') {
        return <UserAvatar user={user} size={size} />
    }
    if (!chatModel) {
        return null
    }
    const ModelIcon = chatModelIconComponent(chatModel.model)
    return (
        <span title={`${chatModel.title} by ${chatModel.provider}`}>
            <ModelIcon size={size * 0.75} />
        </span>
    )
}
