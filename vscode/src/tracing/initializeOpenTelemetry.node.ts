import { Resource } from '@opentelemetry/resources'
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

export function initialize(): void {
    const sdk = new NodeSDK({
        resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: 'cody',
            [SemanticResourceAttributes.SERVICE_VERSION]: '0.1',
        }),
        traceExporter: new ConsoleSpanExporter(),
        metricReader: new PeriodicExportingMetricReader({
            exporter: new ConsoleMetricExporter(),
        }),
    })
    sdk.start()
}
