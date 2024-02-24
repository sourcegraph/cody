import * as Sentry from '@sentry/browser'

import { type SentryOptions, SentryService } from './sentry'

export class WebSentryService extends SentryService {
    public reconfigure(options: SentryOptions): void {
        Sentry.init(options)
    }
}
