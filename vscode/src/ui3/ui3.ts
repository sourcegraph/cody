import {
    type InteractiveThreadService,
    type MessageAPI,
    type RequestMessage,
    type ResponseMessage,
    type UI3WebviewToExtensionAPI,
    type UI3Window,
    type WindowID,
    addMessageListenersForExtensionAPI,
    authStatus,
    createAgentForInteractiveThread,
    promiseFactoryToObservable,
} from '@sourcegraph/cody-shared'

export interface UI3Service {
    createWindow(
        id: WindowID,
        messageAPI: MessageAPI<ResponseMessage, RequestMessage>
    ): Promise<UI3Window>
}

interface UI3Deps {
    interactiveThreadService: InteractiveThreadService
}

export function createUI3Service({ interactiveThreadService }: UI3Deps): UI3Service {
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

            addMessageListenersForExtensionAPI<UI3WebviewToExtensionAPI>(messageAPI, {
                authStatus: () => authStatus,
                observeThread: (...args) => interactiveThreadService.observe(...args),
                updateThread: (...args) =>
                    promiseFactoryToObservable(() => interactiveThreadService.update(...args)),
                startAgentForThread: (...args) =>
                    createAgentForInteractiveThread(interactiveThreadService, ...args),
                historyThreadIDs: () => interactiveThreadService.observeHistoryThreadIDs(),
            })

            return w
        },
    }
}

let globalUI3Service: UI3Service | undefined

export function getUI3Service(): UI3Service {
    if (!globalUI3Service) {
        throw new Error('UI3Service not initialized')
    }
    return globalUI3Service
}

export function setUI3Service(ui3Service: UI3Service): void {
    globalUI3Service = ui3Service
}
