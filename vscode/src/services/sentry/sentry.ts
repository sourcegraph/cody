import type { init as browserInit } from '@sentry/browser'
import type { init as nodeInit } from '@sentry/node'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

export * from '@sentry/core'
export const SENTRY_DSN = 'https://f565373301c9c7ef18448a1c60dfde8d@o19358.ingest.sentry.io/4505743319564288'

export type SentryOptions = Parameters<typeof nodeInit | typeof browserInit>[0]

export abstract class SentryService {
    constructor(protected config: Pick<Configuration, 'serverEndpoint'>) {
        this.prepareReconfigure()
    }

    public onConfigurationChange(newConfig: Pick<Configuration, 'serverEndpoint'>): void {
        this.config = newConfig
        this.prepareReconfigure()
    }

    private prepareReconfigure(): void {
        const isProd = process.env.NODE_ENV === 'production'
        const options: SentryOptions = {
            dsn: SENTRY_DSN,
            debug: !isProd,
            beforeSend: event => {
                // Only send errors when connected to dotcom
                if (!isDotCom(this.config.serverEndpoint) && isProd) {
                    return null
                }
                return event
            },
        }
        this.reconfigure(options)
    }

    protected abstract reconfigure(options: Parameters<typeof nodeInit | typeof browserInit>[0]): void
}
