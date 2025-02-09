import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent, params }) => {
    const threadService = (await parent()).threadService
    const thread = threadService.observe(params.thread, {
        getOrCreate: true,
    })

    return { thread }
}
