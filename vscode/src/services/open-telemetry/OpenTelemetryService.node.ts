import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import {
    FeatureFlag,
    type ResolvedConfiguration,
    type Unsubscribable,
    featureFlagProvider,
    resolvedConfig,
} from '@sourcegraph/cody-shared'

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { version } from '../../version'
import { CodyTraceExporter } from './CodyTraceExport'
import { ConsoleBatchSpanExporter } from './console-batch-span-exporter'

export class OpenTelemetryService {
    private tracerProvider?: NodeTracerProvider
    private unloadInstrumentations?: () => void
    private isTracingEnabled = false

    private lastTraceUrl: string | undefined
    // We use a single promise object that we chain on to, to avoid multiple reconfigure calls to
    // be run in parallel
    private reconfigurePromiseMutex: Promise<void> = Promise.resolve()

    private configSubscription: Unsubscribable

    constructor() {
        this.configSubscription = resolvedConfig.subscribe(({ configuration, auth }) => {
            this.reconfigurePromiseMutex = this.reconfigurePromiseMutex.then(async () => {
                this.isTracingEnabled =
                    configuration.experimentalTracing ||
                    (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteTracing))

                const traceUrl = new URL('/-/debug/otlp/v1/traces', auth.serverEndpoint).toString()
                if (this.lastTraceUrl === traceUrl) {
                    return
                }
                this.lastTraceUrl = traceUrl

                const logLevel = configuration.debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
                diag.setLogger(new DiagConsoleLogger(), logLevel)

                await this.reset()

                this.unloadInstrumentations = registerInstrumentations({
                    instrumentations: [new HttpInstrumentation()],
                })
                this.configureTracerProvider(traceUrl, { configuration, auth })
            })
        })
    }

    public dispose(): void {
        this.configSubscription.unsubscribe()
    }

    private configureTracerProvider(
        traceUrl: string,
        { configuration, auth }: Pick<ResolvedConfiguration, 'configuration' | 'auth'>
    ): void {
        this.tracerProvider = new NodeTracerProvider({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: version,
            }),
        })

        // Add the default tracer exporter used in production.
        this.tracerProvider.addSpanProcessor(
            new BatchSpanProcessor(
                new CodyTraceExporter({
                    traceUrl,
                    isTracingEnabled: this.isTracingEnabled,
                    accessToken: auth.accessToken,
                })
            )
        )

        // Add the console exporter used in development for verbose logging and debugging.
        if (process.env.NODE_ENV === 'development' || configuration.debugVerbose) {
            this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(new ConsoleBatchSpanExporter()))
        }

        this.tracerProvider.register()
    }

    public async reset(): Promise<void> {
        await this.tracerProvider?.shutdown()
        this.unloadInstrumentations?.()
    }
}
