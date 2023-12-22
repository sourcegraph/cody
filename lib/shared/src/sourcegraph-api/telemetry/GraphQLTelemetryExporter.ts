import { TelemetryEventInput, TelemetryExporter } from '@sourcegraph/telemetry'

import { isError } from '../../utils'
import { LogEventMode, SourcegraphGraphQLAPIClient } from '../graphql/client'

/**
 * GraphQLTelemetryExporter exports events via the new Sourcegraph telemetry
 * framework: https://sourcegraph.com/docs/dev/background-information/telemetry
 *
 * If configured to do so, it will also attempt to send events to the old
 * event-logging mutations if the instance is older than 5.2.0.
 */
export class GraphQLTelemetryExporter implements TelemetryExporter {
    private exportMode: ExportMode | undefined
    private legacySiteIdentification:
        | {
              siteid: string
              hashedLicenseKey: string
          }
        | null
        | undefined

    constructor(
        public client: SourcegraphGraphQLAPIClient,
        anonymousUserID: string,
        /**
         * logEvent mode to use if exporter needs to use a legacy export mode.
         */
        private legacyBackcompatLogEventMode: LogEventMode
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
        if (this.exportMode === undefined) {
            const siteVersion = await this.client.getSiteVersion()
            if (isError(siteVersion)) {
                console.warn('telemetry: failed to evaluate server version:', siteVersion)
                return // we can try again later
            }

            const insiderBuild = siteVersion.length > 12 || siteVersion.includes('dev')
            if (insiderBuild) {
                this.exportMode = '5.2.5+' // use full export, set to 'legacy' to test backcompat mode
            } else if (siteVersion === '5.2.0' || siteVersion === '5.2.1') {
                // special handling required before https://github.com/sourcegraph/sourcegraph/pull/57719
                this.exportMode = '5.2.0-5.2.1'
            } else if (siteVersion === '5.2.2' || siteVersion === '5.2.3') {
                // special handling required before https://github.com/sourcegraph/sourcegraph/pull/58643 and https://github.com/sourcegraph/sourcegraph/pull/58539
                this.exportMode = '5.2.2-5.2.3'
            } else if (siteVersion === '5.2.4') {
                // special handling required before https://github.com/sourcegraph/sourcegraph/pull/58944
                this.exportMode = '5.2.4'
            } else if (siteVersion >= '5.2.5') {
                this.exportMode = '5.2.5+'
            } else {
                this.exportMode = 'legacy'
            }
            console.log('telemetry: evaluated export mode:', this.exportMode)
        }
        if (this.exportMode === 'legacy' && this.legacySiteIdentification === undefined) {
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

        /**
         * Use the legacy logEvent mutation with the configured legacyBackcompatLogEventMode
         * if setLegacyEventsStateOnce determines we need to do so.
         */
        if (this.exportMode === 'legacy') {
            const resultOrError = await Promise.all(
                events.map(event =>
                    this.client.logEvent(
                        {
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
                        },
                        this.legacyBackcompatLogEventMode
                    )
                )
            )
            if (isError(resultOrError)) {
                console.error('Error exporting telemetry events as legacy event logs:', resultOrError, {
                    legacyBackcompatLogEventMode: this.legacyBackcompatLogEventMode,
                })
            }

            return
        }

        /**
         * Manipulate events as needed based on version of target instance
         */
        if (this.exportMode) {
            handleExportModeTransforms(this.exportMode, events)
        }

        /**
         * Record events with the new mutations.
         */
        const resultOrError = await this.client.recordTelemetryEvents(events)
        if (isError(resultOrError)) {
            console.error('Error exporting telemetry events:', resultOrError)
        }
    }
}

type ExportMode = 'legacy' | '5.2.0-5.2.1' | '5.2.2-5.2.3' | '5.2.4' | '5.2.5+'

/**
 * handleExportModeTransforms mutates events in-place based on any workarounds
 * required for exportMode.
 */
export function handleExportModeTransforms(exportMode: ExportMode, events: TelemetryEventInput[]): void {
    if (exportMode === 'legacy') {
        throw new Error('legacy export mode should not publish new telemetry events')
    }

    /**
     * In early releases, the privateMetadata field is broken. Circumvent
     * this by filtering out the privateMetadata field for now.
     * https://github.com/sourcegraph/sourcegraph/pull/57719
     */
    if (exportMode === '5.2.0-5.2.1') {
        events.forEach(event => {
            if (event.parameters) {
                event.parameters.privateMetadata = undefined
            }
        })
    }

    /**
     * In early releases, we don't correctly accept float metadata values
     * that may be provided as number. Circumvent this by rounding all
     * metadata values by default.
     * https://github.com/sourcegraph/sourcegraph/pull/58643
     *
     * We also don't support a interaction ID as a first-class citizen, as it
     * was only added in 5.2.4: https://github.com/sourcegraph/sourcegraph/pull/58539
     */
    if (exportMode === '5.2.0-5.2.1' || exportMode === '5.2.2-5.2.3') {
        events.forEach(event => {
            if (event.parameters) {
                event.parameters.metadata?.forEach(entry => {
                    entry.value = Math.round(entry.value)
                })
                event.parameters.interactionID = undefined
            }
        })
    }

    /**
     * timestamp was only added in 5.2.5 and later:
     * https://github.com/sourcegraph/sourcegraph/pull/58944
     */
    if (exportMode === '5.2.0-5.2.1' || exportMode === '5.2.2-5.2.3' || exportMode === '5.2.4') {
        events.forEach(event => {
            event.timestamp = undefined
        })
    }
}
