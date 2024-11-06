import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request'
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch'
import { ZoneContextManager } from '@opentelemetry/context-zone'
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { CodyTraceExporter } from '../../src/services/open-telemetry/CodyTraceExport'

export class WebviewOpenTelemetryService {
    private static instance: WebviewOpenTelemetryService | null = null;
    private tracerProvider?: WebTracerProvider
    private unloadInstrumentations?: () => void
    private isTracingEnabled = false
    private isInitialized = false

    constructor() {
        if (WebviewOpenTelemetryService.instance) {
            return WebviewOpenTelemetryService.instance;
        }
        WebviewOpenTelemetryService.instance = this;
    }

    public configure(options?: {
        isTracingEnabled?: boolean
        debugVerbose?: boolean
    }): void {
        if (this.isInitialized) {
            return;
        }

        const traceUrl = 'http://localhost:4318/v1/traces'
        const accessToken = 'sgp_local_4bc2547d6ef645a2d34b50597159ccd6b599f548'

        const { isTracingEnabled = true, debugVerbose = false } = options || {}

        this.isTracingEnabled = isTracingEnabled

        const logLevel = debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
        diag.setLogger(new DiagConsoleLogger(), logLevel)

        try {
            this.reset();

            this.tracerProvider = new WebTracerProvider({
                resource: new Resource({
                    [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
                }),
            })

            this.unloadInstrumentations = registerInstrumentations({
                instrumentations: [
                    new XMLHttpRequestInstrumentation({
                        propagateTraceHeaderCorsUrls: [
                            'http://localhost:4318'
                        ],
                        clearTimingResources: true,
                        ignoreUrls: [],
                        applyCustomAttributesOnSpan: (span) => {
                            span.setAttribute('Access-Control-Allow-Origin', '*')
                            span.setAttribute('Access-Control-Allow-Methods', 'POST, OPTIONS')
                            span.setAttribute('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                            span.setAttribute('Access-Control-Max-Age', '86400')
                        },
                    }),
                    new FetchInstrumentation({
                        propagateTraceHeaderCorsUrls: [
                            'http://localhost:4318'
                        ],
                        clearTimingResources: true,
                    }),
                ],
            })

            if (traceUrl && this.isTracingEnabled) {
                this.tracerProvider.addSpanProcessor(
                    new BatchSpanProcessor(
                        new CodyTraceExporter({
                            traceUrl,
                            accessToken,
                            isTracingEnabled: true,
                        })
                    )
                )
            }

            this.tracerProvider.register({
                contextManager: new ZoneContextManager(),
            })

            this.isInitialized = true
        } catch (error) {
            console.error('Failed to initialize OpenTelemetry:', error)
            this.reset()
        }
    }

    public reset(): void {
        if (this.tracerProvider) {
            this.unloadInstrumentations?.()
            this.tracerProvider.shutdown()
            this.tracerProvider = undefined
            this.isInitialized = false
        }
    }

    public dispose(): void {
        this.reset()
        WebviewOpenTelemetryService.instance = null
    }

    public static getInstance(): WebviewOpenTelemetryService {
        if (!WebviewOpenTelemetryService.instance) {
            WebviewOpenTelemetryService.instance = new WebviewOpenTelemetryService();
        }
        return WebviewOpenTelemetryService.instance;
    }
}