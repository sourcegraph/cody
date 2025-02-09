import { route } from '$lib/route-helpers'
import { newThreadID } from '@sourcegraph/cody-shared'
import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
    const threadID = newThreadID()
    redirect(303, route('/chat/[thread=threadID]', { params: { thread: threadID } }))
}
