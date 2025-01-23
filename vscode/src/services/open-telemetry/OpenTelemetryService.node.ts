import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import {
    FeatureFlag,
    type Unsubscribable,
    addAuthHeaders,
    combineLatest,
    featureFlagProvider,
    resolvedConfig,
} from '@sourcegraph/cody-shared'

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { externalAuthRefreshChanges } from '@sourcegraph/cody-shared/src/configuration/auth-resolver'
import { isEqual } from 'lodash'
import { version } from '../../version'
import { CodyTraceExporter } from './CodyTraceExport'
import { ConsoleBatchSpanExporter } from './console-batch-span-exporter'

export interface OpenTelemetryServiceConfig {
    isTracingEnabled: boolean
    traceUrl: string
    headers: Record<string, string>
    debugVerbose: boolean
}

export class OpenTelemetryService {
    private tracerProvider?: NodeTracerProvider
    private unloadInstrumentations?: () => void

    private lastConfig: OpenTelemetryServiceConfig | undefined

    // We use a single promise object that we chain on to, to avoid multiple reconfigure calls to
    // be run in parallel
    private reconfigurePromiseMutex: Promise<void> = Promise.resolve()

    private configSubscription: Unsubscribable

    // TODO: CODY-4720 - Race between config and auth update can lead to easy to make errors.
    // `externalAuthRefresh` or `resolvedConfig` can emit before `auth` is updated, leading to potentially incoherent state.
    // E.g. url endpoint may not match the endpoint for which headers were generated
    // `addAuthHeaders` function have internal guard against this, but it would be better to solve this issue on the architecture level
    constructor() {
        this.configSubscription = combineLatest(
            externalAuthRefreshChanges,
            resolvedConfig,
            featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteTracing)
        ).subscribe(([_, { configuration, auth }, codyAutocompleteTracingFlag]) => {
            this.reconfigurePromiseMutex = this.reconfigurePromiseMutex
                .then(async () => {
                    const isTracingEnabled =
                        configuration.experimentalTracing || codyAutocompleteTracingFlag

                    const traceUrl = new URL('/-/debug/otlp/v1/traces', auth.serverEndpoint).toString()

                    const httpHeaders = new Headers()
                    if (auth) await addAuthHeaders(auth, httpHeaders, new URL(traceUrl))
                    const headers = Object.fromEntries(httpHeaders.entries())

                    const newConfig = {
                        isTracingEnabled: isTracingEnabled,
                        traceUrl: traceUrl,
                        headers: headers,
                        debugVerbose: configuration.debugVerbose,
                    }

                    if (isEqual(this.lastConfig, newConfig)) {
                        return
                    }
                    this.lastConfig = newConfig

                    const logLevel = configuration.debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
                    diag.setLogger(new DiagConsoleLogger(), logLevel)

                    await this.reset().catch(error => {
                        console.error('Error reset OpenTelemetry:', error)
                    })

                    this.unloadInstrumentations = registerInstrumentations({
                        instrumentations: [new HttpInstrumentation()],
                    })

                    this.configureTracerProvider(this.lastConfig)
                })
                .catch(error => {
                    console.error('Error configuring OpenTelemetry:', error)
                })
        })
    }

    public dispose(): void {
        this.configSubscription.unsubscribe()
    }

    private configureTracerProvider(config: OpenTelemetryServiceConfig): void {
        this.tracerProvider = new NodeTracerProvider({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: version,
            }),
        })

        // Add the default tracer exporter used in production.
        this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(new CodyTraceExporter(config)))

        // Add the console exporter used in development for verbose logging and debugging.
        if (process.env.NODE_ENV === 'development' || config.debugVerbose) {
            this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(new ConsoleBatchSpanExporter()))
        }

        this.tracerProvider.register()
    }

    public async reset(): Promise<void> {
        await this.tracerProvider?.shutdown()
        this.unloadInstrumentations?.()
    }
}
