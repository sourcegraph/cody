import { MessageAPI, RequestMessage, ResponseMessage, type UI3Window, type WindowID, addMessageListenersForExtensionAPI, authStatus, createMessageAPIForExtension, newWindowID } from '@sourcegraph/cody-shared'
import { ExtensionMessage, WebviewMessage } from '../chat/protocol'

export interface UI3Service {
    createWindow(messageAPI: MessageAPI<ResponseMessage,RequestMessage>,onMessage: (msg:WebviewMessage)=>void): Promise<UI3Window>
    receiveMessage(id: WindowID, message: WebviewMessage): void
}

export function createUI3Service(): UI3Service {
    type UI3WindowInternal = UI3Window & {
        messageAPI: MessageAPI<ResponseMessage,RequestMessage>
        onMessage: (msg:WebviewMessage)=>void
    }
    const windows = new Map<WindowID, UI3WindowInternal>()
    return {
        async createWindow(messageAPI: MessageAPI<ResponseMessage,RequestMessage>,onMessage: (msg:WebviewMessage)=>void): Promise<UI3Window> {
            const id = newWindowID()
            const w: UI3WindowInternal = {
                id,
                messageAPI,
                onMessage,
            }
            windows.set(id, w)

            addMessageListenersForExtensionAPI(
                messageAPI,
                {
                    authStatus: () => authStatus,
                }
            )

            return w
        },
        receiveMessage(id, message):void {
            const w = windows.get(id)
            if (!w) {
                throw new Error(`received message for unknown window ${id}`)
            }
            //w.messageAPI.postMessage(message.command==='rpc/request' ? message.message)
            w.onMessage(message)
        },
    }
}

export const ui3Service = createUI3Service()
