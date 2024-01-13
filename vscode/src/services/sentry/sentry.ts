import type { init as browserInit } from '@sentry/browser'
import type { init as nodeInit } from '@sentry/node'

import { type ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import {
    isAbortError,
    isAuthError,
    isRateLimitError,
    NetworkError,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { version } from '../../version'

export * from '@sentry/core'
const SENTRY_DSN = 'https://f565373301c9c7ef18448a1c60dfde8d@o19358.ingest.sentry.io/4505743319564288'

export type SentryOptions = NonNullable<Parameters<typeof nodeInit | typeof browserInit>[0]>

export abstract class SentryService {
    constructor(
        protected config: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'isRunningInsideAgent' | 'agentIDE'>
    ) {
        this.prepareReconfigure()
    }

    public onConfigurationChange(newConfig: Pick<ConfigurationWithAccessToken, 'serverEndpoint'>): void {
        this.config = newConfig
        this.prepareReconfigure()
    }

    private prepareReconfigure(): void {
        try {
            const isProd = process.env.NODE_ENV === 'production'

            // Used to enable Sentry reporting in the development environment.
            const isSentryEnabled = process.env.ENABLE_SENTRY === 'true'
            if (!isSentryEnabled) {
                return
            }

            const options: SentryOptions = {
                dsn: SENTRY_DSN,
                release: version,
                environment: this.config.isRunningInsideAgent
                    ? 'agent'
                    : typeof process === 'undefined'
                    ? 'vscode-web'
                    : 'vscode-node',

                // In dev mode, have Sentry log extended debug information to the console.
                debug: !isProd,

                // Only send errors when connected to dotcom in the production build.
                beforeSend: (event, hint) => {
                    if (
                        isProd &&
                        isDotCom(this.config.serverEndpoint) &&
                        shouldErrorBeReported(hint.originalException)
                    ) {
                        return event
                    }

                    return null
                },

                // The extension host is shared across other extensions, so listening on the default
                // unhandled error listeners would not be helpful in case other extensions or VS Code
                // throw. Instead, use the manual `captureException` API.
                //
                // When running inside Agent, we control the whole Node environment so we can safely
                // listen to unhandled errors/rejections.
                ...(this.config.isRunningInsideAgent ? {} : { defaultIntegrations: false }),
            }

            this.reconfigure(options)
        } catch (error) {
            // We don't want to crash the extension host or VS Code if Sentry fails to load.
            console.error('Failed to initialize Sentry', error)
        }
    }

    protected abstract reconfigure(options: Parameters<typeof nodeInit | typeof browserInit>[0]): void
}

export function shouldErrorBeReported(error: unknown): boolean {
    if (error instanceof NetworkError) {
        // Ignore Server error responses (5xx).
        return error.status < 500
    }

    if (isAbortError(error) || isRateLimitError(error) || isAuthError(error)) {
        return false
    }

    return true
}
