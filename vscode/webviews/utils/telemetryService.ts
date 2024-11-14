import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { CodyTraceExporterWeb } from '../../src/services/open-telemetry/CodyTraceExportWeb'

export class WebviewOpenTelemetryService {
    private static instance: WebviewOpenTelemetryService | null = null
    private tracerProvider?: WebTracerProvider
    private unloadInstrumentations?: () => void
    private isTracingEnabled = false
    private isInitialized = false

    constructor() {
        if (!WebviewOpenTelemetryService.instance) {
            WebviewOpenTelemetryService.instance = this
            this.reset()
        }
    }

    public configure(options?: {
        isTracingEnabled?: boolean
        debugVerbose?: boolean
    }): void {
        if (this.isInitialized || WebviewOpenTelemetryService.instance !== this) {
            return
        }

        const { isTracingEnabled = true, debugVerbose = false } = options || {}
        this.isTracingEnabled = isTracingEnabled

        const logLevel = debugVerbose ? DiagLogLevel.INFO : DiagLogLevel.ERROR
        diag.setLogger(new DiagConsoleLogger(), logLevel)

        try {
            this.tracerProvider = new WebTracerProvider({
                resource: new Resource({
                    [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
                }),
            })

            if (this.isTracingEnabled) {
                this.tracerProvider.addSpanProcessor(
                    new BatchSpanProcessor(
                        new CodyTraceExporterWeb({
                            isTracingEnabled: true,
                        })
                    )
                )
            }

            this.tracerProvider.register()
            this.isInitialized = true
            console.log('WebviewOpenTelemetryService initialized')
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
            WebviewOpenTelemetryService.instance = new WebviewOpenTelemetryService()
        }
        return WebviewOpenTelemetryService.instance
    }
}
