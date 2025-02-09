import { route } from '$lib/route-helpers'
import { newThreadID } from '@sourcegraph/cody-shared/src/threads/interactive/session'
import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
    const threadID = newThreadID()
    throw redirect(303, route('/chat/[thread]', { params: { thread: threadID } }))
}

// TODO!(sqs): need to persist last chat for tab state and for local persistence without needing to hit server
