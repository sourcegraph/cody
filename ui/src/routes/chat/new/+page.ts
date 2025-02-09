import { route } from '$lib/route-helpers'
import { newThreadID } from '@sourcegraph/cody-shared/src/threads/interactive/session'
import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
    const threadID = newThreadID()
    redirect(303, route('/chat/[thread]', { params: { thread: threadID } }))
}
