import { tapLog } from '@sourcegraph/cody-shared'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent, params }) => {
    const { webviewAPIClient } = await parent()

    console.log('THREAD GET')
    const thread = webviewAPIClient.api
        .observeThread(params.thread, {
            getOrCreate: true,
        })
        .pipe(tapLog('observeThread'))
    return { thread }
}
