import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import {
    type CodyIDE,
    FeatureFlag,
    type Unsubscribable,
    addAuthHeaders,
    clientCapabilities,
    combineLatest,
    featureFlagProvider,
    resolvedConfig,
    startWith,
} from '@sourcegraph/cody-shared'

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { externalAuthRefresh } from '@sourcegraph/cody-shared/src/configuration/auth-resolver'
import { isEqual } from 'lodash'
import { CodyTraceExporter } from './CodyTraceExport'
import { ConsoleBatchSpanExporter } from './console-batch-span-exporter'

export interface OpenTelemetryServiceConfig {
    isTracingEnabled: boolean
    traceUrl: string
    authHeaders: Record<string, string>
    debugVerbose: boolean
    ide: CodyIDE
    /** Version of the Cody VS Code extension (e.g. v1.66.0) */
    extensionVersion?: string
}
export class OpenTelemetryService {
    private tracerProvider?: NodeTracerProvider
    private spanProcessors: BatchSpanProcessor[] = []
    private unloadInstrumentations?: () => void
    private isTracingEnabled = false

    // be run in parallel
    private lastConfig: OpenTelemetryServiceConfig | undefined
    private reconfigurePromiseMutex: Promise<void> = Promise.resolve()
    private configSubscription: Unsubscribable
    private instrumentationUnload?: () => void
    private diagLogger: DiagConsoleLogger = new DiagConsoleLogger()
    private currentLogLevel: DiagLogLevel = DiagLogLevel.ERROR

    // TODO: CODY-4720 - Race between config and auth update can lead to easy to make errors.
    // `externalAuthRefresh` or `resolvedConfig` can emit before `auth` is updated, leading to potentially incoherent state.
    // E.g. url endpoint may not match the endpoint for which headers were generated
    // `addAuthHeaders` function have internal guard against this, but it would be better to solve this issue on the architecture level
    constructor() {
        // Initialize once and never replace
        this.tracerProvider = new NodeTracerProvider({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: clientCapabilities().agentExtensionVersion,
            }),
        })
        // Register once at startup
        this.tracerProvider.register()

        this.configSubscription = combineLatest(
            resolvedConfig,
            featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteTracing),
            externalAuthRefresh.pipe(startWith(undefined))
        ).subscribe(([{ configuration, auth }, codyAutocompleteTracingFlag]) => {
            this.reconfigurePromiseMutex = this.reconfigurePromiseMutex
                .then(async () => {
                    this.isTracingEnabled =
                        configuration.experimentalTracing || codyAutocompleteTracingFlag

                    const traceUrl = new URL('/-/debug/otlp/v1/traces', auth.serverEndpoint)

                    const headers = new Headers()
                    await addAuthHeaders(auth, headers, traceUrl)

                    const newConfig = {
                        isTracingEnabled: this.isTracingEnabled,
                        traceUrl: traceUrl.toString(),
                        debugVerbose: configuration.debugVerbose,
                        authHeaders: Object.fromEntries(headers.entries()),
                        ide: clientCapabilities().agentIDE,
                        extensionVersion: clientCapabilities().agentExtensionVersion,
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
        const logLevel = newConfig.debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
        if (logLevel !== this.currentLogLevel) {
            diag.setLogger(this.diagLogger, logLevel)
            this.currentLogLevel = logLevel
        }

        this.instrumentationUnload?.()
        this.instrumentationUnload = registerInstrumentations({
            instrumentations: [new HttpInstrumentation()],
        })

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
