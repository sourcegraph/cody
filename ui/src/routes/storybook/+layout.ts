import { error } from '@sveltejs/kit'
import type { LayoutLoad } from './$types'
import { STORYBOOK_CONFIG } from './config'

export const load: LayoutLoad = async () => {
    if (!STORYBOOK_CONFIG.enabled) {
        throw error(404, { message: 'Storybook is not enabled.' })
    }
}
