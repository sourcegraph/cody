import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent, params }) => {
    const thread = (await parent()).threadService.observe(params.thread, {
        getOrCreate: true,
    })
    return { thread }
}
