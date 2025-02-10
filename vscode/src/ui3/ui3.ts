import {
    type MessageAPI,
    type RequestMessage,
    type ResponseMessage,
    type UI3Window,
    type WindowID,
    addMessageListenersForExtensionAPI,
    authStatus,
} from '@sourcegraph/cody-shared'

export interface UI3Service {
    createWindow(
        id: WindowID,
        messageAPI: MessageAPI<ResponseMessage, RequestMessage>
    ): Promise<UI3Window>
}

export function createUI3Service(): UI3Service {
    type UI3WindowInternal = UI3Window & {
        messageAPI: MessageAPI<ResponseMessage, RequestMessage>
    }
    const windows = new Map<WindowID, UI3WindowInternal>()
    return {
        async createWindow(
            id: WindowID,
            messageAPI: MessageAPI<ResponseMessage, RequestMessage>
        ): Promise<UI3Window> {
            if (windows.has(id)) {
                throw new Error(`window ${id} already exists`)
            }

            const w: UI3WindowInternal = {
                id,
                messageAPI,
            }
            windows.set(id, w)

            addMessageListenersForExtensionAPI(messageAPI, {
                authStatus: () => authStatus,
            })

            return w
        },
    }
}

export const ui3Service = createUI3Service()
