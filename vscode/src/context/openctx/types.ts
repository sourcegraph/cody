import type { Provider } from '@openctx/client'

export interface OpenContextProvider extends Provider {
    providerUri: string
}
