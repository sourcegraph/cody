import * as Sentry from '@sentry/browser'

import { SentryService, type SentryOptions } from './sentry'

export class WebSentryService extends SentryService {
    public reconfigure(options: SentryOptions): void {
        Sentry.init(options)
    }
}
