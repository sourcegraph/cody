import * as Sentry from '@sentry/node'

import { SentryService, type SentryOptions } from './sentry'

export class NodeSentryService extends SentryService {
    public reconfigure(options: SentryOptions): void {
        Sentry.init(options)
    }
}
