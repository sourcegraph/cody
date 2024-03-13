import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import {
    type ConfigurationWithAccessToken,
    FeatureFlag,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { version } from '../../version'
import { ConsoleBatchSpanExporter } from './console-batch-span-exporter'

export type OpenTelemetryServiceConfig = Pick<
    ConfigurationWithAccessToken,
    'serverEndpoint' | 'experimentalTracing' | 'debugVerbose'
>

export class OpenTelemetryService {
    private tracerProvider?: NodeTracerProvider
    private unloadInstrumentations?: () => void

    private lastTraceUrl: string | undefined
    // We use a single promise object that we chain on to, to avoid multiple reconfigure calls to
    // be run in parallel
    private reconfigurePromiseMutex: Promise<void> = Promise.resolve()

    constructor(protected config: OpenTelemetryServiceConfig) {
        this.reconfigurePromiseMutex = this.reconfigurePromiseMutex.then(() => this.reconfigure())
    }

    public onConfigurationChange(newConfig: OpenTelemetryServiceConfig): void {
        this.config = newConfig
        this.reconfigurePromiseMutex = this.reconfigurePromiseMutex.then(() => this.reconfigure())
    }

    private async reconfigure(): Promise<void> {
        const isEnabled =
            this.config.experimentalTracing ||
            (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteTracing))

        if (!isEnabled) {
            return
        }

        const traceUrl = new URL('/-/debug/otlp/v1/traces', this.config.serverEndpoint).toString()
        if (this.lastTraceUrl === traceUrl) {
            return
        }
        this.lastTraceUrl = traceUrl

        const logLevel = this.config.debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
        diag.setLogger(new DiagConsoleLogger(), logLevel)

        await this.reset()

        this.unloadInstrumentations = registerInstrumentations({
            instrumentations: [new HttpInstrumentation()],
        })
        this.configureTracerProvider(traceUrl)
    }

    public configureTracerProvider(traceUrl: string): void {
        this.tracerProvider = new NodeTracerProvider({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: version,
            }),
        })

        // Add the default tracer exporter used in production.
        this.tracerProvider.addSpanProcessor(
            new BatchSpanProcessor(
                new OTLPTraceExporter({ url: traceUrl, httpAgentOptions: { rejectUnauthorized: false } })
            )
        )

        // Add the console exporter used in development for verbose logging and debugging.
        if (process.env.NODE_ENV === 'development' || this.config.debugVerbose) {
            this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(new ConsoleBatchSpanExporter()))
        }

        this.tracerProvider.register()
    }

    public async reset(): Promise<void> {
        await this.tracerProvider?.shutdown()
        this.unloadInstrumentations?.()
    }
}
