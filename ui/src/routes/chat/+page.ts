import { route } from '$lib/route-helpers'
import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
    const thread = Math.floor(Math.random() * 100000).toString()
    throw redirect(303, route('/chat/[thread]', { params: { thread } }))
}

// TODO!(sqs): need to persist last chat for tab state and for local persistence without needing to hit server
