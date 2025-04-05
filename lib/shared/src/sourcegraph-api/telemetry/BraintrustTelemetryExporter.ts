import { type TelemetryEventInput, type TelemetryExporter } from '@sourcegraph/telemetry'

/**
 * BraintrustTelemetryExporter exports telemetry events to Braintrust.
 * 
 * This exporter requires the 'braintrust' package to be installed:
 * npm install braintrust
 * 
 * It also requires a Braintrust API key to be set in the configuration.
 */
export class BraintrustTelemetryExporter implements TelemetryExporter {
    private logger: any | null = null
    private initialized = false
    private pendingEvents: TelemetryEventInput[] = []

    constructor(private apiKey?: string, private projectName = 'Cody') {
        // Lazy initialization to avoid requiring the braintrust package
        // until it's actually needed
    }

    private async initialize(): Promise<void> {
        if (this.initialized) {
            return
        }

        if (!this.apiKey) {
            console.warn('BraintrustTelemetryExporter: No API key provided, telemetry will not be sent to Braintrust')
            this.initialized = true
            return
        }

        try {
            // Dynamically import braintrust to avoid requiring it as a dependency
            const braintrust = await import('braintrust')
            
            this.logger = await braintrust.initLogger(this.projectName, {
                apiKey: this.apiKey,
                asyncFlush: true,
            })
            
            this.initialized = true
            
            // Process any pending events
            if (this.pendingEvents.length > 0) {
                await this.exportEvents(this.pendingEvents)
                this.pendingEvents = []
            }
        } catch (error) {
            console.error('BraintrustTelemetryExporter: Failed to initialize Braintrust logger', error)
            this.initialized = true // Mark as initialized to avoid repeated attempts
        }
    }

    async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        if (!this.initialized) {
            // Queue events until initialization is complete
            this.pendingEvents.push(...events)
            await this.initialize()
            return
        }

        if (!this.logger) {
            // Logger initialization failed or no API key provided
            return
        }

        for (const event of events) {
            try {
                // Convert telemetry event to Braintrust log format
                this.logger.log({
                    input: {
                        feature: event.feature,
                        action: event.action,
                    },
                    output: event.parameters.privateMetadata || {},
                    metadata: {
                        ...this.extractMetadata(event),
                        timestamp: event.timestamp,
                        client: event.client,
                        clientVersion: event.clientVersion,
                    },
                })
            } catch (error) {
                console.error('BraintrustTelemetryExporter: Failed to export event to Braintrust', error)
            }
        }

        // Flush logs to ensure they're sent to Braintrust
        try {
            await this.logger.flush()
        } catch (error) {
            console.error('BraintrustTelemetryExporter: Failed to flush logs to Braintrust', error)
        }
    }

    private extractMetadata(event: TelemetryEventInput): Record<string, any> {
        const metadata: Record<string, any> = {}
        
        // Convert numeric metadata array to object
        if (event.parameters.metadata) {
            for (const item of event.parameters.metadata) {
                metadata[item.key] = item.value
            }
        }
        
        return metadata
    }
}
