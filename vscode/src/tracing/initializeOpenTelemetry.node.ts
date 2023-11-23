import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
// import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'

export class OpenTelemetryService {
    private provider: BasicTracerProvider | undefined
    constructor(protected config: Pick<Configuration, 'serverEndpoint'>) {
        void this.reconfigure()
    }

    public onConfigurationChange(newConfig: Pick<Configuration, 'serverEndpoint'>): void {
        this.config = newConfig
        void this.reconfigure()
    }

    private async reconfigure(): Promise<void> {
        await this.provider?.shutdown()

        const traceUrl = new URL('/-/debug/otlp/v1/traces', this.config.serverEndpoint).toString()

        console.log({ traceUrl })

        this.provider = new BasicTracerProvider({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: '0.1',
            }),
        })

        const exporter = new OTLPTraceExporter({
            url: traceUrl,
        })
        this.provider.addSpanProcessor(new BatchSpanProcessor(exporter))
        this.provider.register()

        //  this.provider.getTracer(context.extensionId)

        // this.sdk = new NodeSDK({
        //     resource: new Resource({
        //         [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
        //         [SemanticResourceAttributes.SERVICE_VERSION]: '0.1',
        //     }),
        //     // instrumentations: [new HttpInstrumentation()],
        //     traceExporter: new OTLPTraceExporter({
        //         url: traceUrl,
        //         headers: {},
        //     }),
        //     // metricReader: new PeriodicExportingMetricReader({
        //     //     exporter: new ConsoleMetricExporter(),
        //     // }),
        // })
        // this.sdk.start()
    }
}
