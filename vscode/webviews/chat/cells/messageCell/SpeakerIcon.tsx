import type { ChatMessage, ModelProvider } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../../../Chat'
import { chatModelIconComponent } from '../../../Components/ChatModelIcon'
import { UserAvatar } from '../../../Components/UserAvatar'

/**
 * A component that shows the user's avatar for human messages and the LLM's icon for assistant
 * messages.
 */
export const SpeakerIcon: FunctionComponent<{
    message: Pick<ChatMessage, 'speaker'>
    userInfo: UserAccountInfo
    chatModel: ModelProvider | undefined
    size: number
}> = ({ message, userInfo: { user }, chatModel, size }) => {
    if (message.speaker === 'human') {
        return <UserAvatar user={user} size={size} />
    }

    const ModelIcon = chatModel ? chatModelIconComponent(chatModel.model) : null
    return ModelIcon ? <ModelIcon size={size * 0.75} /> : null
}
