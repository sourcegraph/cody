import type { InitialContextKind } from './chat/types'
import type { ContextItem } from './codebase-context/messages'

/**
 * The state of the client (such as VS Code) that the webview needs to monitor.
 */
export interface ClientStateForWebview {
    /**
     * Initial context items to populate in the input in chat inputs.
     */
    initialContext: ContextItem[]

    /**
     * What kind of context items to include in the initial context.
     */
    preferredInitialContextKind?: InitialContextKind
}

export function determineInitialContext(state: ClientStateForWebview): ContextItem[] {
    const preferredInitialContextKind = state.preferredInitialContextKind
    // HACK: should not mutate state here.
    state.preferredInitialContextKind = undefined
    console.log('INITIAL_CONTEXT2222222', JSON.stringify(state.preferredInitialContextKind, null, 2))

    switch (preferredInitialContextKind) {
        case 'public-knowledge-only':
            return []
        case 'file-only':
            return state.initialContext.filter(
                item => item?.source === 'initial' && item.type === 'file'
            )
        case 'repository-only':
            return state.initialContext.filter(
                item =>
                    item?.source === 'initial' &&
                    (item.type === 'tree' || item.type === 'repository' || item.type === 'file')
            )
        default:
            return state.initialContext
    }
}
