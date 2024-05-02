import {
    NoOpTelemetryExporter,
    type TelemetryEventInput,
    type TelemetryProcessor,
    TelemetryRecorderProvider as BaseTelemetryRecorderProvider,
    TestTelemetryExporter,
    TimestampTelemetryProcessor,
    defaultEventRecordingOptions,
} from '@sourcegraph/telemetry'

import {
    CONTEXT_SELECTION_ID,
    type Configuration,
    type ConfigurationWithAccessToken,
} from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import type { LogEventMode } from '../sourcegraph-api/graphql/client'
import { GraphQLTelemetryExporter } from '../sourcegraph-api/telemetry/GraphQLTelemetryExporter'
import { MockServerTelemetryExporter } from '../sourcegraph-api/telemetry/MockServerTelemetryExporter'

import type { BillingCategory, BillingProduct } from '.'
import type { AuthStatus } from '../auth/types'
import { getTier } from './cody-tier'

interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'

    /** Version number for the extension. */
    version: string
}

/**
 * TelemetryRecorderProvider is the default provider implementation. It sends
 * events directly to a connected Sourcegraph instance.
 *
 * This is NOT meant for use if connecting to an Agent.
 */
export class TelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    BillingProduct,
    BillingCategory
> {
    constructor(
        extensionDetails: ExtensionDetails,
        config: ConfigurationWithAccessToken,
        getAuthStatus: () => AuthStatus,
        anonymousUserID: string,
        legacyBackcompatLogEventMode: LogEventMode
    ) {
        const client = new SourcegraphGraphQLAPIClient(config)
        super(
            {
                client: `${extensionDetails.ide || 'unknown'}${
                    extensionDetails.ideExtensionType ? `.${extensionDetails.ideExtensionType}` : ''
                }`,
                clientVersion: extensionDetails.version,
            },
            process.env.CODY_TELEMETRY_EXPORTER === 'testing'
                ? new TestTelemetryExporter()
                : new GraphQLTelemetryExporter(client, anonymousUserID, legacyBackcompatLogEventMode),
            [
                new ConfigurationMetadataProcessor(config, getAuthStatus),
                // Generate timestamps when recording events, instead of serverside
                new TimestampTelemetryProcessor(),
            ],
            {
                ...defaultEventRecordingOptions,
                bufferTimeMs: 0, // disable buffering for now
            }
        )
    }
}

/**
 * TelemetryRecorder is the type of recorders returned by
 * TelemetryRecorderProviders in this module. It's available as a type to work
 * around type reference issues like:
 *
 *   The inferred type of 'telemetryRecorder' cannot be named without a reference <...>
 */
export type TelemetryRecorder = typeof noOpTelemetryRecorder

export class NoOpTelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    BillingProduct,
    BillingCategory
> {
    constructor(processors?: TelemetryProcessor[]) {
        super({ client: '' }, new NoOpTelemetryExporter(), processors || [])
    }
}
/**
 * noOpTelemetryRecorder should ONLY be used in tests - it discards all recorded events and does nothing with them.
 */
export const noOpTelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder()

/**
 * MockServerTelemetryRecorderProvider uses MockServerTelemetryExporter to export
 * events.
 */
export class MockServerTelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    BillingProduct,
    BillingCategory
> {
    constructor(
        extensionDetails: ExtensionDetails,
        config: ConfigurationWithAccessToken,
        getAuthStatus: () => AuthStatus,
        anonymousUserID: string
    ) {
        super(
            {
                client: `${extensionDetails.ide}.${extensionDetails.ideExtensionType}`,
                clientVersion: extensionDetails.version,
            },
            new MockServerTelemetryExporter(anonymousUserID),
            [new ConfigurationMetadataProcessor(config, getAuthStatus)]
        )
    }
}

/**
 * ConfigurationMetadataProcessor turns config into metadata that is
 * automatically attached to all events.
 */
class ConfigurationMetadataProcessor implements TelemetryProcessor {
    constructor(
        private config: Configuration,
        private getAuthStatus: () => AuthStatus
    ) {}

    public processEvent(event: TelemetryEventInput): void {
        if (!event.parameters.metadata) {
            event.parameters.metadata = []
        }
        event.parameters.metadata.push(
            {
                key: 'contextSelection',
                value: CONTEXT_SELECTION_ID[this.config.useContext],
            },
            {
                key: 'guardrails',
                value: this.config.experimentalGuardrails ? 1 : 0,
            },
            {
                key: 'ollama',
                value: this.config.experimentalOllamaChat ? 1 : 0,
            },
            {
                key: 'tier',
                value: getTier(this.getAuthStatus()),
            }
        )
    }
}
