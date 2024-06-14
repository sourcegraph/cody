import { URI } from 'vscode-uri'

import { hydrateAfterPostMessage } from '@sourcegraph/cody-shared'

import type { ExtensionMessage, WebviewMessage } from '../../src/chat/protocol'

declare const acquireVsCodeApi: () => VSCodeApi

export interface VSCodeApi {
    getState: () => unknown
    setState: (newState: unknown) => unknown
    postMessage: (message: unknown) => void
}

export interface VSCodeWrapper {
    postMessage(message: WebviewMessage): void
    onMessage(callback: (message: ExtensionMessage) => void): () => void
    getState(): unknown
    setState(newState: unknown): void
}

let api: VSCodeWrapper

export function getVSCodeAPI(): VSCodeWrapper {
    if (!api) {
        const vsCodeApi = acquireVsCodeApi()
        api = {
            postMessage: message => {
                console.log('postMessage ' + JSON.stringify(message))
                vsCodeApi.postMessage(message)
            },
            onMessage: callback => {
                const listener = (event: MessageEvent<ExtensionMessage>): void => {
                    console.log('receiveMessage ' + JSON.stringify(event.data))
                    callback(hydrateAfterPostMessage(event.data, uri => URI.from(uri as any)))
                }
                window.addEventListener('message', listener)
                return () => window.removeEventListener('message', listener)
            },
            setState: newState => {
                console.log('setState ' + JSON.stringify(newState))
                vsCodeApi.setState(newState)
            },
            getState: () => {
                const state = vsCodeApi.getState()
                console.log('getState' + JSON.stringify(state))
                return state
            },
        }
    }
    return api
}

export function setVSCodeWrapper(value: VSCodeWrapper): void {
    api = value
}
