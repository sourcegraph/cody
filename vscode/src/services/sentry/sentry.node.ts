import * as Sentry from '@sentry/node'

import { AsyncLocalStorage } from 'node:async_hooks'
import { type SentryOptions, SentryService } from './sentry'

export const insideExtensionAsyncLocalStorage = new AsyncLocalStorage<boolean>()

export class NodeSentryService extends SentryService {
    public reconfigure(options: SentryOptions): void {
        const originalBeforeSend = options.beforeSend

        Sentry.init({
            ...options,
            beforeSend: (event, hint) => {
                console.log('got error', hint.originalException)
                console.log('inside ext?', insideExtensionAsyncLocalStorage.getStore())
                if (originalBeforeSend) {
                    return originalBeforeSend?.(event, hint)
                }
                return event
            },
        })
    }
}
