import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { version } from '../version'

export class OpenTelemetryService {
    private sdk: NodeSDK | undefined
    private lastTraceUrl: string | undefined
    // We use a single promise object that we chain on to, to avoid multiple reconfigure calls to
    // be run in parallel
    private reconfigurePromiseMutex: Promise<void> = Promise.resolve()

    constructor(protected config: Pick<Configuration, 'serverEndpoint'>) {
        this.reconfigurePromiseMutex = this.reconfigurePromiseMutex.then(() => this.reconfigure())
    }

    public onConfigurationChange(newConfig: Pick<Configuration, 'serverEndpoint'>): void {
        this.config = newConfig
        this.reconfigurePromiseMutex = this.reconfigurePromiseMutex.then(() => this.reconfigure())
    }

    private async reconfigure(): Promise<void> {
        if (!(await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteTracing))) {
            return
        }

        const traceUrl = new URL('/-/debug/otlp/v1/traces', this.config.serverEndpoint).toString()
        if (this.lastTraceUrl === traceUrl) {
            return
        }
        this.lastTraceUrl = traceUrl

        await this.sdk?.shutdown()
        this.sdk = undefined

        this.sdk = new NodeSDK({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: 'cody-client',
                [SemanticResourceAttributes.SERVICE_VERSION]: version,
            }),
            instrumentations: [new HttpInstrumentation()],
            traceExporter: new OTLPTraceExporter({
                url: traceUrl,
            }),
        })
        this.sdk.start()
    }
}
