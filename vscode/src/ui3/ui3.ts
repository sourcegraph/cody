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
    createMessageAPIForExtension,
    newWindowID,
    promiseFactoryToObservable,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { createUI3WebviewManager } from './webview'

export interface UI3Service extends vscode.Disposable {
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

    const webviewManager = createUI3WebviewManager()

    async function createWindow(
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
            observeHistory: () => interactiveThreadService.observeHistory(),
        })

        return w
    }

    vscode.commands.registerCommand('cody.ui3.createWindow', async () => {
        const webview = await webviewManager.createWebview('editor')
        const messageAPI = createMessageAPIForExtension({
            postMessage: message => webview.postMessage(message),
            postError: error => console.error(error),
            onMessage: callback => {
                const disposable = webview.onDidReceiveMessage(callback)
                return () => disposable.dispose()
            },
        })
        await createWindow(newWindowID(), messageAPI)
    })

    return {
        createWindow,
        dispose(): void {
            webviewManager.dispose()
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
