import type { ContextItem } from './codebase-context/messages'

/**
 * The state of the client (such as VS Code) that the webview needs to monitor.
 */
export interface ClientStateForWebview {
    /**
     * Initial context items to populate in the input in chat inputs.
     */
    initialContext: ContextItem[]
}
