import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'

import { extensionDetails } from './telemetry'

export class OpenTelemetryService {
    private sdk: NodeSDK | undefined
    constructor(protected config: Pick<Configuration, 'serverEndpoint'>) {
        void this.reconfigure()
    }

    public onConfigurationChange(newConfig: Pick<Configuration, 'serverEndpoint'>): void {
        this.config = newConfig
        // TODO: Fix race condition when this changes
        // void this.reconfigure()
    }

    private async reconfigure(): Promise<void> {
        await this.sdk?.shutdown()

        const traceUrl = new URL('/-/debug/otlp/v1/traces', this.config.serverEndpoint).toString()

        this.sdk = new NodeSDK({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: extensionDetails.version,
            }),
            instrumentations: [new HttpInstrumentation()],
            traceExporter: new OTLPTraceExporter({
                url: traceUrl,
            }),
        })
        this.sdk.start()
    }
}
