/**
 * A service to log telemetry data.
 */
export interface TelemetryService {
    /**
     * Log a telemetry event.
     *
     * PRIVACY: Do NOT include any potentially private information in `eventProperties`. These
     * properties may get sent to analytics tools, so must not include private information, such as
     * search queries or repository names.
     * @param eventName The name of the event.
     * @param properties Event properties. Do NOT include any private information, such as full URLs
     * that may contain private repository names or search queries.
     * @deprecated New callsites should use telemetryRecorder instead. Existing
     * callsites should ALSO record an event using services/telemetry-v2
     * as well and indicate this has happened, for example:
     *
     * logEvent(name, properties, { hasV2Event: true })
     * telemetryRecorder.recordEvent(...)
     *
     * In the future, all usages of TelemetryService will be removed in
     * favour of the new libraries. For more information, see:
     * https://sourcegraph.com/docs/dev/background-information/telemetry
     */
    log(
        eventName: string,
        properties?: TelemetryEventProperties,
        opts?: {
            /**
             * Indicates a new event, using telemetryRecorder, is also
             * recorded, so there's no need to record to the instance,
             * as telemetryRecorder will handle delivering an event to
             * the instance.
             */
            hasV2Event?: boolean

            /**
             * When set, will be logged when the log level is set to agent
             */
            agent?: true
        }
    ): void
}

/**
 * Properties related to a telemetry event.
 */
export interface TelemetryEventProperties {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | string[]
        | TelemetryEventProperties[]
        | TelemetryEventProperties
}

/** For testing. */
export const NOOP_TELEMETRY_SERVICE: TelemetryService = {
    log() {
        /* noop */
    },
}
