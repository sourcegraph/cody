import type { Provider } from '@openctx/client'

export interface OpenCtxProvider extends Provider {
    providerUri: string
}
