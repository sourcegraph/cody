import { ContextStatusProvider } from '../codebase-context/context-status'
import { PreciseContext } from '../codebase-context/messages'

export interface GraphContextFetcher extends ContextStatusProvider {
    getContext(): Promise<PreciseContext[]>
}
