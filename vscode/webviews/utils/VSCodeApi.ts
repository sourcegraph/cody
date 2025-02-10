import { URI } from 'vscode-uri'

import {
    type GenericVSCodeWrapper,
    forceHydration,
    hydrateAfterPostMessage,
} from '@sourcegraph/cody-shared'

import type { ExtensionMessage, WebviewMessage } from '../../src/chat/protocol'

declare const acquireVsCodeApi: () => VSCodeApi

interface VSCodeApi {
    getState: () => unknown
    setState: (newState: unknown) => unknown
    postMessage: (message: unknown) => void
}

export type VSCodeWrapper = GenericVSCodeWrapper<WebviewMessage, ExtensionMessage>

let api: VSCodeWrapper

export function getVSCodeAPI(): VSCodeWrapper {
    if (!api) {
        const vsCodeApi = acquireVsCodeApi()
        api = {
            postMessage: message => vsCodeApi.postMessage(forceHydration(message)),
            onMessage: callback => {
                const listener = (event: MessageEvent<ExtensionMessage>): void => {
                    callback(hydrateAfterPostMessage(event.data, uri => URI.from(uri as any)))
                }
                window.addEventListener('message', listener)
                return () => window.removeEventListener('message', listener)
            },
            setState: newState => vsCodeApi.setState(newState),
            getState: () => vsCodeApi.getState(),
        }
    }
    return api
}

export function setVSCodeWrapper(value: VSCodeWrapper): void {
    api = value
}
