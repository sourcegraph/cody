import type { UI3WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import { getContext, setContext } from 'svelte'

const WEBVIEW_API_CONTEXT_KEY = 'sourcegraph:webviewAPI'

export function setWebviewAPIContext(webviewAPI: UI3WebviewToExtensionAPI): void {
    setContext(WEBVIEW_API_CONTEXT_KEY, webviewAPI)
}

export function getWebviewAPIContext(): UI3WebviewToExtensionAPI {
    const webviewAPI = getContext<UI3WebviewToExtensionAPI>(WEBVIEW_API_CONTEXT_KEY)
    if (!webviewAPI) {
        throw new Error('webview API context not found')
    }
    return webviewAPI
}
