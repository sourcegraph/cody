import { useSelector } from '@xstate/react'
import type { PromptInputActor } from './promptInput-react'

export function useModeSelectorMenu(state: PromptInputActor) {
    const show = useSelector(state, state => state.hasTag('show mode selector'))
    const { modeSelectorMenu } = useSelector(state, state => state.context)

    // Get the mode selector query from the state
    const query = useSelector(state, state => {
        if (!state.hasTag('show mode selector')) return ''
        return modeSelectorMenu.query
    })

    return {
        show,
        items: [
            { id: 'chat', title: 'Chat', description: 'Ask Cody a question' },
            { id: 'search', title: 'Search', description: 'Search in your codebase' },
            { id: 'edit', title: 'Edit', description: 'Edit your code' },
        ],
        selectedIndex: modeSelectorMenu.selectedIndex,
        position: modeSelectorMenu.position,
        query,
    }
}
