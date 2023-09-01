import * as Sentry from '@sentry/browser'

import { SentryOptions, SentryService } from './sentry'

export class WebSentryService extends SentryService {
    public reconfigure(options: SentryOptions): void {
        Sentry.init(options)
    }
}
