import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { ModelSelectField } from '../../../../../../components/modelSelectField/ModelSelectField'
import { useChatModelContext } from '../../../../../models/chatModelContext'

export const ModelSelectFieldToolbarItem: FunctionComponent<{
    userInfo: UserAccountInfo
}> = ({ userInfo }) => {
    const { chatModels, onCurrentChatModelChange } = useChatModelContext()

    return (
        !!chatModels?.length &&
        onCurrentChatModelChange &&
        userInfo &&
        userInfo.isDotComUser && (
            <ModelSelectField
                models={chatModels}
                onModelSelect={onCurrentChatModelChange}
                userInfo={userInfo}
                align="start"
            />
        )
    )
}
