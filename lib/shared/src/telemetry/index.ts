/**
 * A service to log telemetry data.
 */
export interface TelemetryService {
    /**
     * Send a telemetry event.
     */
    log<E extends string, P extends TelemetryEventProps>(eventName: E, properties: P): void
    log(eventName: string, properties: { [key: string]: string | number | boolean }): void
}

/**
 * A typed telemetry event.
 *
 * @example telemetryService.log<MyEvent>('my-event', {myKey: 'my-value'})
 */
export interface TelemetryEvent<E extends string, P extends TelemetryEventProps> {
    eventName: E
    properties: P
}

interface TelemetryEventProps {
    [key: string]: string | number | boolean
}
