import { route } from '$lib/route-helpers'
import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
    throw redirect(303, route('/chat/new'))
}
