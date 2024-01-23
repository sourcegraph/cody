import type { ContextStatusProvider } from '../codebase-context/context-status'
import type { PreciseContext } from '../codebase-context/messages'

export interface GraphContextFetcher extends ContextStatusProvider {
    getContext(): Promise<PreciseContext[]>
}
