import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'

export function initialize(config: Pick<Configuration, 'serverEndpoint'>): void {
    console.log({ url: new URL('/-/debug/otlp', config.serverEndpoint).toString() })
    const sdk = new NodeSDK({
        resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: 'cody',
            [SemanticResourceAttributes.SERVICE_VERSION]: '0.1',
        }),
        instrumentations: [new HttpInstrumentation()],
        traceExporter: new OTLPTraceExporter({ url: new URL('/-/debug/otlp', config.serverEndpoint).toString() }),
        // metricReader: new PeriodicExportingMetricReader({
        //     exporter: new ConsoleMetricExporter(),
        // }),
    })
    sdk.start()
}
