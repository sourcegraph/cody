import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { getContext, setContext } from 'svelte'

const WEBVIEW_API_CONTEXT_KEY = 'sourcegraph:webviewAPI'

export function setWebviewAPIContext(webviewAPI: WebviewToExtensionAPI): void {
    setContext(WEBVIEW_API_CONTEXT_KEY, webviewAPI)
}

export function getWebviewAPIContext(): WebviewToExtensionAPI {
    const webviewAPI = getContext<WebviewToExtensionAPI>(WEBVIEW_API_CONTEXT_KEY)
    if (!webviewAPI) {
        throw new Error('webview API context not found')
    }
    return webviewAPI
}
