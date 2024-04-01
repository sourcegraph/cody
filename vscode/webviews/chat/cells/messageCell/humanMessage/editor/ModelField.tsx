import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import { ChatModelDropdownMenu } from '../../../../../Components/ChatModelDropdownMenu'
import { useChatModelContext } from '../../../../models/chatModelContext'
import styles from './ModelField.module.css'

/**
 * A field for selecting a model for a human message in the {@link HumanMessageEditor} toolbar.
 */
export const ModelField: FunctionComponent<{
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>
}> = () => {
    const { chatModels, onCurrentChatModelChange } = useChatModelContext()

    return chatModels && onCurrentChatModelChange ? (
        <ChatModelDropdownMenu
            models={chatModels}
            onCurrentChatModelChange={onCurrentChatModelChange}
            userInfo={{ isCodyProUser: true, isDotComUser: true }}
            disabled={false}
            showSelectionIcon={false}
            className={styles.dropdown}
        />
    ) : null
}
