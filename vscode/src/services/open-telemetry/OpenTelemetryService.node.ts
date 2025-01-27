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
    private spanProcessors: BatchSpanProcessor[] = [] // Track span processors
    private unloadInstrumentations?: () => void
    private lastConfig: OpenTelemetryServiceConfig | undefined
    private reconfigurePromiseMutex: Promise<void> = Promise.resolve()
    private configSubscription: Unsubscribable
    private instrumentationUnload?: () => void
    private diagLogger: DiagConsoleLogger = new DiagConsoleLogger()

    constructor() {
        // Initialize once and never replace
        this.tracerProvider = new NodeTracerProvider({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: version,
            }),
        })
        // Register once at startup
        this.tracerProvider.register()

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
                    await this.reset()
                    await this.handleConfigUpdate(newConfig)
                    this.lastConfig = newConfig
                })
                .catch(error => {
                    console.error('Error configuring OpenTelemetry:', error)
                })
        })
    }

    private async handleConfigUpdate(newConfig: OpenTelemetryServiceConfig): Promise<void> {
        // Update diagnostics first
        const logLevel = newConfig.debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
        diag.setLogger(this.diagLogger, logLevel)

        // Update instrumentation
        this.instrumentationUnload?.()
        this.instrumentationUnload = registerInstrumentations({
            instrumentations: [new HttpInstrumentation()],
        })

        // Swap span processors
        await this.replaceSpanProcessors(newConfig)
    }

    public dispose(): void {
        this.configSubscription.unsubscribe()
        this.reset().catch(error => console.error('Error disposing OpenTelemetry:', error))
    }

    private async replaceSpanProcessors(config: OpenTelemetryServiceConfig): Promise<void> {
        const newProcessors = [new BatchSpanProcessor(new CodyTraceExporter(() => config))]

        if (config.debugVerbose || process.env.NODE_ENV === 'development') {
            newProcessors.push(new BatchSpanProcessor(new ConsoleBatchSpanExporter()))
        }
        const provider = this.tracerProvider as any
        const oldProcessors = this.spanProcessors

        // Clear the provider's internal processor list and active processor
        provider._registeredSpanProcessors = []
        provider.activeSpanProcessor = {
            forceFlush: async () => {},
            onStart: () => {},
            onEnd: () => {},
            shutdown: async () => {},
        }

        // Add new processors to the provider
        for (const processor of newProcessors) {
            this.tracerProvider?.addSpanProcessor(processor)
        }

        // Gracefully shutdown old processors after clearing references
        setTimeout(async () => {
            try {
                await Promise.all(oldProcessors.map(p => p.shutdown()))
            } catch (error) {
                console.error('Error shutting down old processors:', error)
            }
        }, 5000)
        const list = this.tracerProvider?.getActiveSpanProcessor()
        console.log('list', list)
    }

    public async reset(): Promise<void> {
        // Shutdown span processors and instrumentations
        if (this.spanProcessors.length > 0) {
            await Promise.all(this.spanProcessors.map(processor => processor.shutdown()))
            this.spanProcessors = []
        }
        this.unloadInstrumentations?.()
    }
}
