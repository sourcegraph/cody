import { TelemetryEventInput, TelemetryExporter } from '@sourcegraph/telemetry'

import { isError } from '../../utils'
import { SourcegraphGraphQLAPIClient } from '../graphql/client'

/**
 * GraphQLTelemetryExporter exports events via the
 */
export class GraphQLTelemetryExporter implements TelemetryExporter {
    private shouldUseLegacyEvents: boolean | undefined
    private legacySiteIdentification:
        | {
              siteid: string
              hashedLicenseKey: string
          }
        | null
        | undefined

    constructor(
        public client: SourcegraphGraphQLAPIClient,
        anonymousUserID: string
    ) {
        this.client.setAnonymousUserID(anonymousUserID)
    }

    /**
     * Checks if the connected server supports the new GraphQL mutations
     * and sets the result to this.shouldUseLegacyEvents, and if we need to use
     * legacy events, we also set this.legacySiteIdentification to the site ID
     * of the connected instance - this is used to generate arguments for the
     * legacy event-recording API.
     */
    private async setLegacyEventsStateOnce(): Promise<void> {
        if (this.shouldUseLegacyEvents === undefined) {
            const siteVersion = await this.client.getSiteVersion()
            if (isError(siteVersion)) {
                return // swallow errors
            }

            const insiderBuild = siteVersion.length > 12 || siteVersion.includes('dev')
            if (insiderBuild) {
                this.shouldUseLegacyEvents = false
                return
            }

            this.shouldUseLegacyEvents = siteVersion >= '5.2.0'
        }
        if (this.shouldUseLegacyEvents && this.legacySiteIdentification === undefined) {
            const siteIdentification = await this.client.getSiteIdentification()
            if (isError(siteIdentification)) {
                /**
                 * Swallow errors. Any instance with a version before https://github.com/sourcegraph/sourcegraph/commit/05184f310f631bb36c6d726792e49ff9d122e4af
                 * will return an error here due to it not having new parameters in its GraphQL schema or database schema.
                 */
                this.legacySiteIdentification = null
                return
            }
            this.legacySiteIdentification = siteIdentification
        }
    }

    /**
     * Implements export functionality by checking if the connected instance
     * supports the new events record first - if it does, we use the new
     * API, otherwise we translate the event into the old API and use that
     * instead.
     */
    public async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        await this.setLegacyEventsStateOnce()
        if (this.shouldUseLegacyEvents) {
            // Swallow any problems, this is only a best-effort mechanism to
            // use the old export mechanism.
            await Promise.all(
                events.map(event =>
                    this.client.logEvent({
                        client: event.source.client,
                        event: `${event.feature}.${event.action}`,
                        source: 'IDEEXTENSION', // hardcoded in existing client
                        url: event.marketingTracking?.url || '',
                        publicArgument: () =>
                            event.parameters.metadata?.reduce((acc, curr) => ({
                                ...acc,
                                [curr.key]: curr.value,
                            })),
                        argument: JSON.stringify(event.parameters.privateMetadata),
                        userCookieID: this.client.anonymousUserID || '',
                        connectedSiteID: this.legacySiteIdentification?.siteid,
                        hashedLicenseKey: this.legacySiteIdentification?.hashedLicenseKey,
                    })
                )
            )

            return
        }

        // Otherwise, use the new mechanism as intended.
        const resultOrError = await this.client.recordTelemetryEvents(events)
        if (isError(resultOrError)) {
            console.error('Error exporting telemetry events:', resultOrError)
        }
    }
}
