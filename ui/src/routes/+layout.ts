import { createInteractiveThreadService, localStorageThreadStorage } from '@sourcegraph/cody-shared'
import { createWebviewAPIClient } from '../lib/webview-api/webview-api'
import type { LayoutLoad } from './$types'

export const load: LayoutLoad = async () => {
    const webviewAPIClient = await createWebviewAPIClient()
    const threadService = createInteractiveThreadService(localStorageThreadStorage(window.localStorage))

    return {
        webviewAPIClient,
        threadService,
    }
}

export const ssr = false
