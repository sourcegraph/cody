import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent, params }) => {
    const { webviewAPIClient } = await parent()

    const thread = webviewAPIClient.api.observeThread(params.thread, {
        getOrCreate: true,
    })
    const threadAgent = webviewAPIClient.api.startAgentForThread(params.thread)
    return { thread, threadAgent }
}
