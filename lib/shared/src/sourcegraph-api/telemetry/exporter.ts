import { TelemetryEventInput } from '@sourcegraph/telemetry/dist/api'
import { TelemetryExporter } from '@sourcegraph/telemetry/dist/exporters'

import { isError } from '../../utils'
import { SourcegraphGraphQLAPIClient } from '../graphql/client'

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

    private async setShouldUseLegacyEventsOnce(): Promise<void> {
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
    }

    private async setLegacySiteIdentificationOnce(): Promise<void> {
        if (this.legacySiteIdentification === undefined) {
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

    public async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        await this.setShouldUseLegacyEventsOnce()
        if (this.shouldUseLegacyEvents) {
            await this.setLegacySiteIdentificationOnce()

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
