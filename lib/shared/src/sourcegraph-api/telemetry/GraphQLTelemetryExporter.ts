import type { TelemetryEventInput, TelemetryExporter } from '@sourcegraph/telemetry'

import { currentResolvedConfig } from '../../configuration/resolver'
import { logDebug, logError } from '../../logger'
import { isError } from '../../utils'
import { type LogEventMode, graphqlClient } from '../graphql/client'

interface TelemetrySubmitter {
    /**
     * Submits the event for export.
     */
    submit(event: TelemetryEventInput): void;
    /**
     * Finish any ongoing work and release any resources held, including flushing
     * buffers if one is configured.
     */
    unsubscribe(): void;
}

type TelemetryRecordingOptions = {
    /**
     * Time to buffer events for, in ms. Set to 0 to disable buffering (default).
     */
    bufferTimeMs: number;
    /**
     * Maximum number of events to buffer at once.
     */
    bufferMaxSize: number;
    /**
     * Handle processing/export errors.
     */
    errorHandler: (error: any) => void;
  };

  interface TelemetryBatchExporter {
    /**
     * Processes a batch of telemetry events.
     * @param events - An array of telemetry events to process.
     */
    processBatch(events: TelemetryEventInput[]): Promise<void>;
}
  

class BatchSubmitter implements TelemetrySubmitter {
    private events: TelemetryEventInput[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
  

    constructor(
        private exporter: TelemetryBatchExporter,
        private options: TelemetryRecordingOptions
    ) {
        this.startTimer();
    }

  
    private startTimer() {
      this.timer = setInterval(() => {
        this.flushEvents();
      }, this.options.bufferTimeMs);
    }
  
    private flushEvents() {
      if (this.events.length > 0) {
        const eventsToExport = this.events.splice(0, this.options.bufferMaxSize);
        console.log('BatchSubmitter flushEvents length', eventsToExport.length);
        console.log('BatchSubmitter flushEvents the events are ', eventsToExport);
        this.exporter.processBatch(eventsToExport)
          .catch((error: any) => {
            this.options.errorHandler(error);
          });
      }
    }
  
    submit(event: TelemetryEventInput) {
      if (this.timer !== null) {
        this.events.push(event);
        if (this.events.length >= this.options.bufferMaxSize) {
          this.flushEvents();
        }
      } else {
        this.exporter
          .processBatch([event])
          .catch((err) => this.options.errorHandler(err))
          .then(() =>
            this.options.errorHandler("submitted event after complete")
          );
      }
    }
  
    unsubscribe(): void {
      this.flushEvents();
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

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

    private submitter: BatchSubmitter;
    constructor(
        /**
         * logEvent mode to use if exporter needs to use a legacy export mode.
         */
        private legacyBackcompatLogEventMode: LogEventMode,
        private options: TelemetryRecordingOptions
    ) {
        console.log('GraphQLTelemetryExporter constructor', this.options);
        this.submitter = new BatchSubmitter(this, options);
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
            const siteVersion = await graphqlClient.getSiteVersion()
            if (isError(siteVersion)) {
                logError(
                    'GraphQLTelemetryExporter',
                    'telemetry: failed to evaluate server version:',
                    siteVersion
                )
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
            logDebug('GraphQLTelemetryExporter', 'evaluated export mode:', this.exportMode)
        }
        if (this.exportMode === 'legacy' && this.legacySiteIdentification === undefined) {
            const siteIdentification = await graphqlClient.getSiteIdentification()
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
        events.forEach(event => this.submitter.submit(event));
    }

    public async processBatch(events: TelemetryEventInput[]): Promise<void> {
        console.log('GraphQLTelemetryExporter processBatch', events.length);
        console.log('GraphQLTelemetryExporter processBatch the events are ', events);
        await this.setLegacyEventsStateOnce();

        if (this.exportMode === 'legacy') {
            const { clientState } = await currentResolvedConfig()
            const resultOrError = await Promise.all(
                events.map(event =>
                    graphqlClient.logEvent(
                        {
                            client: event.source.client,
                            event: `${event.feature}.${event.action}`,
                            source: 'IDEEXTENSION', // hardcoded in existing client
                            url: event.marketingTracking?.url || '',
                            publicArgument: () =>
                                event.parameters.metadata?.reduce((acc, curr) => ({
                                    // biome-ignore lint/performance/noAccumulatingSpread: TODO(sqs): this is a legit perf issue
                                    ...acc,
                                    [curr.key]: curr.value,
                                })),
                            argument: JSON.stringify(event.parameters.privateMetadata),
                            userCookieID: clientState.anonymousUserID || '',
                            connectedSiteID: this.legacySiteIdentification?.siteid,
                            hashedLicenseKey: this.legacySiteIdentification?.hashedLicenseKey,
                        },
                        this.legacyBackcompatLogEventMode
                    )
                )
            )
            if (isError(resultOrError)) {
                logError(
                    'GraphQLTelemetryExporter',
                    'Error exporting telemetry events as legacy event logs:',
                    resultOrError,
                    {
                        legacyBackcompatLogEventMode: this.legacyBackcompatLogEventMode,
                    }
                )
            }

            return;
        }

        if (this.exportMode) {
            handleExportModeTransforms(this.exportMode, events);
        }

        const resultOrError = await graphqlClient.recordTelemetryEvents(events);
        if (isError(resultOrError)) {
            logError('GraphQLTelemetryExporter', 'Error exporting telemetry events:', resultOrError);
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
        for (const event of events) {
            if (event.parameters) {
                event.parameters.privateMetadata = undefined
            }
        }
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
        for (const event of events) {
            if (event.parameters) {
                if (event.parameters.metadata) {
                    for (const entry of event.parameters.metadata) {
                        entry.value = Math.round(entry.value)
                    }
                }
                event.parameters.interactionID = undefined
            }
        }
    }

    /**
     * timestamp was only added in 5.2.5 and later:
     * https://github.com/sourcegraph/sourcegraph/pull/58944
     */
    if (exportMode === '5.2.0-5.2.1' || exportMode === '5.2.2-5.2.3' || exportMode === '5.2.4') {
        for (const event of events) {
            event.timestamp = undefined
        }
    }
}
