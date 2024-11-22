import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import type { CodyIDE } from '@sourcegraph/cody-shared/src/configuration'
import { CodyTraceExporterWeb } from '../../src/services/open-telemetry/CodyTraceExportWeb'

// This class is used to initialize and manage the OpenTelemetry service for the webview.
// Its inspired by the OpenTelemetryService class in the node extension.
// It is used to initialize the tracer provider and add a span processor that exports the spans to the webview.
export class WebviewOpenTelemetryService {
    private static instance: WebviewOpenTelemetryService | null = null
    private tracerProvider?: WebTracerProvider
    private unloadInstrumentations?: () => void
    private isTracingEnabled = false
    private isInitialized = false
    private agentIDE?: CodyIDE
    private extensionAgentVersion?: string
    constructor() {
        if (!WebviewOpenTelemetryService.instance) {
            WebviewOpenTelemetryService.instance = this
            this.reset()
        }
    }

    public configure(options?: {
        isTracingEnabled?: boolean
        debugVerbose?: boolean
        agentIDE?: CodyIDE
        extensionAgentVersion?: string
    }): void {
        // If the service is already initialized or if it is not the instance that is being used, return
        if (this.isInitialized || WebviewOpenTelemetryService.instance !== this) {
            return
        }

        const {
            isTracingEnabled = true,
            debugVerbose = false,
            agentIDE,
            extensionAgentVersion,
        } = options || {}
        this.isTracingEnabled = isTracingEnabled
        this.agentIDE = agentIDE
        this.extensionAgentVersion = extensionAgentVersion
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
                            clientPlatform: this.agentIDE ?? ('defaultIDE' as CodyIDE),
                            agentVersion: this.extensionAgentVersion,
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
        if (WebviewOpenTelemetryService.instance !== this) {
            return
        }
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
